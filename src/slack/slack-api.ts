import { createHash } from "node:crypto";
import type { RequestPolicy } from "./request-policy.ts";
import type { RequestMetrics } from "./request-metrics.ts";
import { setApiContext } from "./request-context.ts";
import { countLabel } from "../shared/plural.ts";

// Slack公式Web APIへの通信。認証情報はヘッダーだけに載せ、応答や通信例外に含まれる秘密を表示しない。
export type ApiMethod =
  | "auth.test"
  | "conversations.list"
  | "conversations.members"
  | "users.list"
  | "users.conversations"
  | "search.messages"
  | "conversations.history"
  | "conversations.replies"
  | "conversations.info"
  | "conversations.open"
  | "chat.postMessage"
  | "reactions.get"
  | "reactions.add"
  | "reactions.remove";
export type ApiParams = Record<string, unknown>;
export type ApiSource =
  | "background"
  | "directory"
  | "search"
  | "triage"
  | "membership"
  | "thread-context"
  | "post"
  | "reaction"
  | "auth"
  | "unknown";
export type ApiOptions = {
  deadlineAt?: number;
  source?: ApiSource;
  dedupe?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
};
export type ApiCall = (
  method: ApiMethod,
  params?: ApiParams,
  options?: ApiOptions,
) => Promise<Record<string, unknown>>;
export type ApiErrorKind =
  | "deferred"
  | "api"
  | "rate_limited"
  | "timeout"
  | "aborted"
  | "network"
  | "http"
  | "unreadable"
  | "configuration";
export class SlackApiError extends Error {
  kind: ApiErrorKind;
  retryAfter?: number;
  retryAt?: number;
  code?: string;
  constructor(
    kind: ApiErrorKind,
    message: string,
    retryAfter?: number,
    code?: string,
  ) {
    super(message);
    this.name = "SlackApiError";
    this.kind = kind;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function maskTokens(text: string): string {
  return text.replace(/xox[a-z]*[-.][\w.-]+|xapp-[\w-]+/gi, "xox-***");
}
// APIのエラーコードだけを表示し、応答本文・トークン・投稿内容はログに出さない。
const safeCode = (value: unknown) =>
  typeof value === "string" && /^[a-z_]+$/.test(value)
    ? value
    : "unknown_error";
const POST_METHODS: ReadonlySet<ApiMethod> = new Set([
  "auth.test",
  "conversations.open",
  "chat.postMessage",
  // リアクションの追加・除去は書き込みなので、本文(JSON)で送る
  "reactions.add",
  "reactions.remove",
]);
export function createSlackApi(
  token: string,
  fetcher: typeof fetch = fetch,
  config: {
    policy?: RequestPolicy;
    metrics?: RequestMetrics;
    now?: () => number;
  } = {},
): ApiCall {
  const now = config.now ?? Date.now;
  const accessToken = token.trim();
  const pausedUntil = new Map<ApiMethod, number>();
  const sentCallbacks = new WeakMap<ApiOptions, () => void>();
  const execute: ApiCall = async (method, params = {}, options = {}) => {
    if (
      !accessToken.startsWith("xoxp-") &&
      !accessToken.startsWith("xoxe.xoxp-")
    ) {
      throw new SlackApiError(
        "configuration",
        "Set a User OAuth Token (xoxp-) in Slack Access Token",
      );
    }
    const remaining = (pausedUntil.get(method) ?? 0) - now();
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      throw new SlackApiError(
        "rate_limited",
        `Slack API rate limit. Retry in ${countLabel(seconds, "second")}`,
        seconds,
        "ratelimited",
      );
    }
    if (options.signal?.aborted)
      throw new SlackApiError("aborted", "Request canceled");
    const waitMs = config.policy
      ? await config.policy.beforeSend(method, options)
      : 0;
    if (options.signal?.aborted)
      throw new SlackApiError("aborted", "Request canceled");
    config.metrics?.record(
      options.source ?? "unknown",
      method,
      "waitMs",
      waitMs,
    );
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 30000;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      if (options.signal?.aborted) abort();
      if (controller.signal.aborted)
        throw new SlackApiError("aborted", "Request canceled");
      const post = POST_METHODS.has(method);
      const url = new URL(`https://slack.com/api/${method}`);
      if (!post)
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) url.searchParams.set(key, String(value));
        }
      // リダイレクト先へ認証ヘッダーを渡さず、送信も自動再試行しない。
      const init: RequestInit = {
        method: post ? "POST" : "GET",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(post
            ? { "Content-Type": "application/json; charset=utf-8" }
            : {}),
        },
        ...(post ? { body: JSON.stringify(params) } : {}),
        signal: controller.signal,
      };
      if (options.signal?.aborted || controller.signal.aborted)
        throw new SlackApiError("aborted", "Request canceled");
      sentCallbacks.get(options)?.();
      const responsePromise = fetcher(url, init);
      config.metrics?.record(options.source ?? "unknown", method, "requests");
      const response = await responsePromise;
      if (response.status === 429) {
        const raw = Number(response.headers.get("Retry-After"));
        const seconds = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 60;
        pausedUntil.set(method, now() + seconds * 1000);
        await config.policy?.pause(method, seconds);
        config.metrics?.record(
          options.source ?? "unknown",
          method,
          "rateLimited",
        );
        throw new SlackApiError(
          "rate_limited",
          `Slack API rate limit. Retry in ${countLabel(seconds, "second")}`,
          seconds,
          "ratelimited",
        );
      }
      if (!response.ok)
        throw new SlackApiError(
          "http",
          `Slack API HTTP error (${response.status})`,
        );
      let data: Record<string, unknown>;
      try {
        data = object(await response.json());
      } catch {
        throw new SlackApiError(
          "unreadable",
          "Could not read the Slack API response",
        );
      }
      if (data.ok === false) {
        const code = safeCode(data.error);
        if (code === "ratelimited") {
          pausedUntil.set(method, now() + 60000);
          await config.policy?.pause(method, 60);
          config.metrics?.record(
            options.source ?? "unknown",
            method,
            "rateLimited",
          );
          throw new SlackApiError(
            "rate_limited",
            "Slack API rate limit. Retry in 60 seconds",
            60,
            code,
          );
        }
        const needed =
          typeof data.needed === "string" &&
          /^[a-z]+:[a-z_.]+(?:,[a-z]+:[a-z_.]+)*$/.test(data.needed)
            ? `(required permissions: ${data.needed})`
            : "";
        throw new SlackApiError(
          "api",
          `Slack API: ${code}${needed}`,
          undefined,
          code,
        );
      }
      if (data.ok !== true)
        throw new SlackApiError(
          "unreadable",
          "The Slack API response has no ok field",
        );
      return data;
    } catch (error) {
      if (timedOut)
        throw new SlackApiError(
          "timeout",
          `Slack API request timed out after ${countLabel(timeoutMs / 1000, "second")}`,
        );
      if (options.signal?.aborted)
        throw new SlackApiError("aborted", "Request canceled");
      if (error instanceof SlackApiError) throw error;
      throw new SlackApiError("network", "Could not connect to the Slack API");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };
  const flights = new Map<
    string,
    {
      controller: AbortController;
      promise: Promise<Record<string, unknown>>;
      subscribers: number;
      deadlineAt: number;
      started: boolean;
    }
  >();
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object")
      return `{${Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(",")}}`;
    return JSON.stringify(value) ?? "undefined";
  };
  const api: ApiCall = (method, params = {}, options = {}) => {
    if (options.signal?.aborted)
      return Promise.reject(new SlackApiError("aborted", "Request canceled"));
    if (
      options.dedupe === false ||
      method === "chat.postMessage" ||
      method === "conversations.open" ||
      method === "reactions.add" ||
      method === "reactions.remove"
    )
      return execute(method, params, options);
    const key = `${method}:${canonical(params)}:${options.timeoutMs ?? 30000}`;
    let flight = flights.get(key);
    if (!flight) {
      const controller = new AbortController();
      // 操作期限は購読者ごとに扱い、共有通信を先に中断しない。
      const sharedOptions = {
        ...options,
        signal: controller.signal,
        get deadlineAt() {
          return (
            flights.get(key)?.deadlineAt ??
            options.deadlineAt ??
            now() + (options.timeoutMs ?? 30000)
          );
        },
      };
      const promise = Promise.resolve().then(() =>
        execute(method, params, sharedOptions),
      );
      flight = {
        controller,
        promise,
        subscribers: 0,
        started: false,
        deadlineAt: options.deadlineAt ?? now() + (options.timeoutMs ?? 30000),
      };
      flights.set(key, flight);
      sentCallbacks.set(sharedOptions, () => {
        if (flight) flight.started = true;
      });
      const current = flight;
      void promise
        .finally(() => {
          if (flights.get(key) === current) flights.delete(key);
        })
        .catch(() => {});
    }
    const current = flight;
    if (current.subscribers > 0)
      config.metrics?.record(options.source ?? "unknown", method, "coalesced");
    current.subscribers++;
    current.deadlineAt = Math.max(
      current.deadlineAt,
      options.deadlineAt ?? now() + (options.timeoutMs ?? 30000),
    );
    return new Promise((resolve, reject) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: unknown, data?: Record<string, unknown>) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        if (--current.subscribers === 0) {
          current.controller.abort();
          if (flights.get(key) === current) flights.delete(key);
        }
        if (error) reject(error);
        else resolve(data!);
      };
      const abort = () =>
        finish(new SlackApiError("aborted", "Request canceled"));
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      if (options.deadlineAt !== undefined)
        timer = setTimeout(
          () => {
            const error = new SlackApiError(
              current.started ? "timeout" : "deferred",
              current.started
                ? "Slack API request timed out"
                : "Slack API request is waiting",
              0,
            );
            error.retryAt = now();
            finish(error);
          },
          Math.max(0, options.deadlineAt - now()),
        );
      current.promise.then(
        (data) => finish(undefined, data),
        (error) => finish(error),
      );
    });
  };
  setApiContext(
    api,
    createHash("sha256").update(accessToken).digest("hex"),
    config.metrics,
  );
  return api;
}
