import type { Hit } from "../../slack/hits.ts";
import { toMarkdown, type NameLookup } from "../../slack/mrkdwn.ts";
import type { Names } from "../../slack/names.ts";
import { compareTs } from "../../slack/hits.ts";
import type { ThreadDetail } from "./use-thread-context.ts";
// 検索・履歴から取った全文を詳細に出す。保存した短い本文には取り直す操作を示す
export function messageDetailBody(
  hit: Hit,
  names: NameLookup,
  detailText?: string,
): string {
  const body = toMarkdown(detailText ?? hit.text, names);
  return hit.textIsPreview && detailText === undefined
    ? `Preview (⌘R to fetch the full message)\n\n${body}`
    : body;
}

// 名前をMarkdownの構文として解釈させず、投稿本文と混ぜない。
const labelText = (value: string) =>
  value.replace(/[\r\n]/g, " ").replace(/([\\`*_{}[\]()#+.!|>~-])/g, "\\$1");

export function messageTime(ts: string, now = new Date()): string {
  const date = new Date(Number(ts.split(".")[0]) * 1000);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  const otherYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    ...(otherYear ? { year: "numeric" } : {}),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function threadDetailStatus(detail?: ThreadDetail): string | undefined {
  if (!detail) return undefined;
  if (detail.loading) return "Loading earlier messages";
  const failure = detail.failure;
  if (failure?.kind === "scope")
    return "History permissions are required for earlier messages. Check your settings";
  if (failure?.kind === "rate")
    return `Slack rate limit. Refresh details after ${new Date(failure.retryAt ?? Date.now()).toLocaleTimeString("en-US")}`;
  if (failure?.kind === "missing")
    return "This thread is unavailable. Check it in Slack";
  if (failure)
    return "Could not load earlier messages. Refresh details to retry";
  if (detail.data?.capped) return "Fetch limit reached. Read the rest in Slack";
  if (detail.data?.cursor)
    return "More messages remain. Recent context may not be included yet";
  return undefined;
}

export function messageDetailMarkdown(
  hit: Hit,
  names: Names,
  detailText?: string,
  detail?: ThreadDetail,
): string {
  const data = detail?.data;
  const fetched = data?.messages.find((item) => item.ts === hit.ts);
  const selected = fetched ?? hit;
  const block = (item: Hit, selectedBlock: boolean) => {
    const marks = [
      selectedBlock ? "Selected message" : undefined,
      data?.isThread && data.rootTs === item.ts ? "Thread parent" : undefined,
    ].filter(Boolean);
    const body = messageDetailBody(
      item,
      names.lookup,
      selectedBlock ? (detailText ?? fetched?.text) : undefined,
    );
    return `**${labelText(names.sender(item))}**\n\n${labelText(messageTime(item.ts))}${marks.length ? ` · ${marks.join(" · ")}` : ""}\n\n${body || "(No message body)"}`;
  };
  const prior =
    data?.messages
      .filter(
        (item) =>
          item.channelId === hit.channelId && compareTs(item.ts, hit.ts) < 0,
      )
      .sort((a, b) => compareTs(b.ts, a.ts)) ?? [];
  const status = threadDetailStatus(detail);
  return [
    `### ${labelText(names.conversationLabel(hit))}`,
    block(selected, true),
    ...(status ? [status] : []),
    ...prior.map((item) => block(item, false)),
  ].join("\n\n---\n\n");
}
