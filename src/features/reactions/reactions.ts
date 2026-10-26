// リアクションの追加・除去の純粋な部品（入力の検証・自分のリアクションの抽出・API 呼び出し・結果の分類）。
// @raycast/api を読み込まないので、node のテストから動かせる。
//
// 使う公式 API は reactions.get（reactions:read）、reactions.add・reactions.remove（reactions:write）だけ。
// 「対応済み」「開いた」の印（triage）には一切触れない。このフォルダは triage を読み込まない
import type { Hit } from "../../slack/hits.ts";
import {
  maskTokens,
  object,
  SlackApiError,
  type ApiCall,
} from "../../slack/slack-api.ts";
import { countLabel } from "../../shared/plural.ts";

// 書き込みも読み取りも30秒で打ち切る。書き込みの時間切れは「失敗」でなく「反映されたか未確認」として扱う
export const REACTION_TIMEOUT_MS = 30000;

export type ReactionAction = "add" | "remove";

// リアクションを付ける・外す対象のメッセージ
export type ReactionTarget = { channelId: string; ts: string };

export const reactionTargetOf = (
  hit: Pick<Hit, "channelId" | "ts">,
): ReactionTarget => ({ channelId: hit.channelId, ts: hit.ts });

// 会話 ID（C…・D…・G…）と、Slack の ts（秒10桁.小数6桁）の形。形が合わないものは送らない
export const validChannelId = (id: unknown): id is string =>
  typeof id === "string" && /^[CDG][A-Z0-9]+$/.test(id);
export const validMessageTs = (ts: unknown): ts is string =>
  typeof ts === "string" && /^\d{10}\.\d{6}$/.test(ts);
// 絵文字名（コロンなし）。肌の色の指定（::skin-tone-2〜6）だけ「::」を許す
export const validReactionName = (name: unknown): name is string =>
  typeof name === "string" &&
  name.length <= 100 &&
  /^[a-zA-Z0-9_+-]+(?:::skin-tone-[2-6])?$/.test(name);

export const validReactionTarget = (target: ReactionTarget): boolean =>
  validChannelId(target.channelId) && validMessageTs(target.ts);

// ---- 結果 ------------------------------------------------------------------------
export type FailureReason =
  | "invalid_input"
  | "permission"
  | "auth"
  | "gone"
  | "not_allowed"
  | "invalid_name"
  | "limit"
  | "rate_limited"
  | "deferred"
  | "configuration"
  | "rejected";

export type ReactionOutcome =
  // 希望した状態になった。already は「すでにそうなっていた」（already_reacted・no_reaction）
  | { kind: "done"; already: boolean; message: string }
  // 反映されたか分からない（時間切れ・通信エラーなど）。自動で再送しない
  | { kind: "unconfirmed"; message: string }
  // Slack が断った・送る前に終わった失敗。何も変わっていない
  | { kind: "failed"; reason: FailureReason; message: string };

export const PERMISSION_MESSAGE =
  "Slack Compass is not allowed to use reactions. Add the reactions:read and reactions:write User Token Scopes to your Slack app, reinstall the app, and update the token in Raycast if it changed";

const PERMISSION_CODES = new Set(["missing_scope", "not_allowed_token_type"]);
const AUTH_CODES = new Set([
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
  "account_inactive",
]);
const GONE_CODES = new Set([
  "message_not_found",
  "channel_not_found",
  "not_in_channel",
]);
const NOT_ALLOWED_CODES = new Set([
  "not_reactable",
  "thread_locked",
  "is_archived",
  "no_permission",
  "ekm_access_denied",
  "user_is_restricted",
]);
const LIMIT_CODES = new Set(["too_many_emoji", "too_many_reactions"]);
// Slack 側の一時的な不調。反映されたか分からないので、失敗にしない
const INDETERMINATE_CODES = new Set([
  "internal_error",
  "fatal_error",
  "request_timeout",
  "service_unavailable",
]);

const verb = (action: ReactionAction) =>
  action === "add" ? "added" : "removed";

// Slack API の失敗を、案内する文と種類に分ける。undefined は「反映されたか分からない」（時間切れ・通信エラー・読めない応答など）
export function describeApiFailure(
  error: unknown,
  action: ReactionAction | "read",
  name?: string,
): { reason: FailureReason; message: string } | undefined {
  if (!(error instanceof SlackApiError)) return undefined;
  const nothing = action === "read" ? "" : ". Nothing was changed";
  if (error.kind === "configuration")
    return {
      reason: "configuration",
      message: `${maskTokens(error.message)}${nothing}`,
    };
  if (error.kind === "rate_limited")
    return {
      reason: "rate_limited",
      message: `${maskTokens(error.message)}${nothing}`,
    };
  if (error.kind === "deferred")
    return {
      reason: "deferred",
      message: `Slack Compass is waiting for the Slack API rate limit. Try again in a moment${nothing}`,
    };
  if (error.kind !== "api") return undefined;
  const code = error.code ?? "";
  if (INDETERMINATE_CODES.has(code)) return undefined;
  if (PERMISSION_CODES.has(code))
    return { reason: "permission", message: PERMISSION_MESSAGE };
  if (AUTH_CODES.has(code))
    return {
      reason: "auth",
      message: `Slack did not accept your token (${code}). Check Slack Access Token in the extension preferences`,
    };
  if (GONE_CODES.has(code))
    return {
      reason: "gone",
      message: `The message was deleted, or you cannot see it in Slack (${code})${nothing}`,
    };
  if (NOT_ALLOWED_CODES.has(code))
    return {
      reason: "not_allowed",
      message: `Slack does not allow reactions on this message (${code})${nothing}`,
    };
  if (code === "invalid_name")
    return {
      reason: "invalid_name",
      message: `Slack does not recognize the emoji ${name ? `:${name}:` : "name"}${nothing}`,
    };
  if (LIMIT_CODES.has(code))
    return {
      reason: "limit",
      message: `This message already has the maximum number of reactions (${code})${nothing}`,
    };
  return {
    reason: "rejected",
    message: `Slack rejected the request (${code || "unknown_error"})${nothing}`,
  };
}

// 追加・除去の失敗を結果にする。Slack が断ったと分かるものだけ failed、それ以外は unconfirmed（自動で再送しない）
export function classifyReactionError(
  error: unknown,
  action: ReactionAction,
  name: string,
): ReactionOutcome {
  // 「希望した状態になっている」は成功扱い。追加なら already_reacted、除去なら no_reaction
  if (
    error instanceof SlackApiError &&
    error.kind === "api" &&
    error.code === (action === "add" ? "already_reacted" : "no_reaction")
  )
    return {
      kind: "done",
      already: true,
      message:
        action === "add"
          ? `You already reacted with :${name}:. Nothing to change`
          : `:${name}: was already removed. Nothing to change`,
    };
  const failure = describeApiFailure(error, action, name);
  if (failure) return { kind: "failed", ...failure };
  const detail =
    error instanceof SlackApiError
      ? maskTokens(error.message)
      : "Could not connect to the Slack API";
  return {
    kind: "unconfirmed",
    message: `${detail}. The reaction may or may not have been ${verb(action)}. Check the message in Slack before trying again`,
  };
}

// ---- 書き込み ----------------------------------------------------------------------
// 対象と絵文字名を検証してから送る（不正なら送らずに failed を返す）。
// dedupe: false で通信を束ねず、自動の再送も画面を閉じたことによる中断もしない
export async function changeReaction(
  api: ApiCall,
  target: ReactionTarget,
  name: string,
  action: ReactionAction,
): Promise<ReactionOutcome> {
  if (!validReactionTarget(target) || !validReactionName(name))
    return {
      kind: "failed",
      reason: "invalid_input",
      message: "Check the message and the emoji. Nothing was sent",
    };
  const started = Date.now();
  // 送る前に使った時間を引いた残りを渡す（post.ts と同じ）。使い切っていたら送らない
  const remaining = REACTION_TIMEOUT_MS - (Date.now() - started);
  if (remaining <= 0)
    return {
      kind: "failed",
      reason: "deferred",
      message: "The request timed out before it was sent. Nothing was sent",
    };
  try {
    await api(
      action === "add" ? "reactions.add" : "reactions.remove",
      { channel: target.channelId, timestamp: target.ts, name },
      {
        timeoutMs: remaining,
        deadlineAt: started + REACTION_TIMEOUT_MS,
        source: "reaction",
        dedupe: false,
      },
    );
  } catch (error) {
    return classifyReactionError(error, action, name);
  }
  return {
    kind: "done",
    already: false,
    message: action === "add" ? `Added :${name}:` : `Removed :${name}:`,
  };
}

// ---- 読み取り ----------------------------------------------------------------------
const unreadable = () =>
  new SlackApiError(
    "unreadable",
    "Could not read the Slack reactions response",
  );

// 自分のリアクションの読み取り結果
export type MyReactions = {
  // 自分が付けていて、Slack Compass から外せるリアクションの名前
  names: string[];
  // 自分が付けているが、名前の形が合わず Slack Compass では外せないリアクションの件数。黙って捨てず、案内に使う
  unremovable: number;
  // 自分が見つからず、count が users の件数より多いリアクションがある。users が切れていて、
  // 自分のリアクションが一覧から漏れているかもしれない
  incomplete: boolean;
};

// reactions.get の応答から、自分が付けたリアクションを取り出す。形が壊れていれば unreadable。
// 頼っている保証は2つだけ：users に自分の ID があれば、自分が付けたものとして扱う。
// 自分が無くても count > users の件数なら、users が切れている（full: true を付けても全員分が返るとは限らない）として incomplete を立てる。
// users が全員分かどうかは、Slack のドキュメントからは言い切れないので、前提にしない
export function myReactionNames(
  data: Record<string, unknown>,
  target: ReactionTarget,
  selfId: string,
): MyReactions {
  if (data.ok !== true) throw unreadable();
  if (data.channel !== undefined && data.channel !== target.channelId)
    throw unreadable();
  const message = object(data.message);
  if (Object.keys(message).length === 0) throw unreadable();
  if (message.ts !== undefined && message.ts !== target.ts) throw unreadable();
  const result: MyReactions = { names: [], unremovable: 0, incomplete: false };
  if (message.reactions === undefined) return result;
  if (!Array.isArray(message.reactions)) throw unreadable();
  const seen = new Set<string>();
  for (const raw of message.reactions) {
    const reaction = object(raw);
    if (
      typeof reaction.name !== "string" ||
      !Array.isArray(reaction.users) ||
      reaction.users.some((id) => typeof id !== "string")
    )
      throw unreadable();
    if (seen.has(reaction.name)) continue;
    seen.add(reaction.name);
    if (reaction.users.includes(selfId)) {
      if (validReactionName(reaction.name)) result.names.push(reaction.name);
      else result.unremovable++;
    } else if (
      typeof reaction.count === "number" &&
      reaction.count > reaction.users.length
    )
      result.incomplete = true;
  }
  return result;
}

// 除去の一覧に添える案内（英語）。無ければ空
export function mineNotices(mine: MyReactions): string[] {
  const notices: string[] = [];
  if (mine.unremovable > 0)
    notices.push(
      mine.unremovable === 1
        ? "1 reaction of yours has a name Slack Compass cannot remove. Remove it in Slack"
        : `${countLabel(mine.unremovable, "reaction")} of yours have names Slack Compass cannot remove. Remove them in Slack`,
    );
  if (mine.incomplete)
    notices.push(
      "This list may be incomplete: Slack did not return every user for some reactions. Check the message in Slack",
    );
  return notices;
}

export type MyReactionsResult =
  ({ kind: "ready" } & MyReactions) | { kind: "failed"; message: string };

// 自分が付けたリアクションを取る（除去の候補）。失敗は案内する文にして返す
export async function fetchMyReactions(
  api: ApiCall,
  target: ReactionTarget,
  selfId: string,
  signal?: AbortSignal,
): Promise<MyReactionsResult> {
  if (!validReactionTarget(target))
    return {
      kind: "failed",
      message: "Check the message. Nothing was requested",
    };
  try {
    const data = await api(
      "reactions.get",
      { channel: target.channelId, timestamp: target.ts, full: true },
      { signal, source: "reaction", timeoutMs: REACTION_TIMEOUT_MS },
    );
    return { kind: "ready", ...myReactionNames(data, target, selfId) };
  } catch (error) {
    if (error instanceof SlackApiError && error.kind === "aborted")
      return { kind: "failed", message: "Canceled" };
    return {
      kind: "failed",
      message:
        describeApiFailure(error, "read")?.message ??
        "Could not load your reactions. Check your connection and try again",
    };
  }
}
