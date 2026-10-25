import { createHash } from "node:crypto";
import type { Conversation } from "../../shared/types.ts";
import type { ChannelLibrary } from "../channel-library/model.ts";
export type SearchScope = {
  range:
    | {
        kind: "all";
      }
    | {
        kind: "favorites";
      }
    | {
        kind: "section";
        sectionId: string;
      }
    | {
        kind: "channel";
        channelId: string;
      }
    | {
        // その人との DM。検索式は in:<@U>
        kind: "dm";
        userId: string;
      };
  senderId?: string;
  // 宛先。保存済みの古いデータには無いので任意にする
  recipient?: SearchRecipient;
};
// me は「自分宛て」（自分へのメンションと自分への DM）、person はその人へ送られた DM
export type SearchRecipient =
  | {
      kind: "me";
    }
  | {
      kind: "person";
      userId: string;
    };
export type ResolvedScope = {
  channelIds: "all" | string[];
  // 範囲が DM のときの相手。チャンネルの範囲とは同時に持たない
  dmUserId?: string;
  senderId?: string;
  recipient?: SearchRecipient;
  fingerprint: string;
};
export const DEFAULT_SEARCH_SCOPE: SearchScope = { range: { kind: "all" } };
export const validChannelId = (id: string) => /^[CG][A-Z0-9]+$/.test(id);
export const validSenderId = (id: string) => /^[UW][A-Z0-9]+$/.test(id);
// 範囲・送信者・宛先のどれかを指定しているか。指定が無ければ、検索欄の文字列だけで検索する
export function hasStructuredScope(
  scope: Pick<
    ResolvedScope,
    "channelIds" | "dmUserId" | "senderId" | "recipient"
  >,
): boolean {
  return (
    scope.channelIds !== "all" ||
    scope.dmUserId !== undefined ||
    scope.senderId !== undefined ||
    scope.recipient !== undefined
  );
}
// 宛先と DM を含める。条件の組が1つでも違えば別の指紋になる（version を上げて、古い形の指紋と混ざらないようにする）
export function scopeFingerprint(
  channelIds: "all" | readonly string[],
  senderId?: string,
  extra: {
    dmUserId?: string;
    recipient?: SearchRecipient;
  } = {},
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 3,
        channelIds:
          channelIds === "all" ? "all" : [...new Set(channelIds)].sort(),
        senderId: senderId ?? null,
        dmUserId: extra.dmUserId ?? null,
        recipient: extra.recipient ?? null,
      }),
    )
    .digest("hex");
}
// 検索語に依らず、条件の組み合わせだけで結果が必ず空になるものの案内文
export const CONFLICT_PERSON_RECIPIENT_IN_CHANNELS =
  "A recipient other than you matches DMs only. Set the scope to All or a DM";
export const CONFLICT_PERSON_RECIPIENT_TYPED_CHANNEL =
  "A recipient other than you matches DMs only. Delete the in: filter for a channel from the search bar";
export const CONFLICT_DM_SENDER =
  "In the selected DM, the sender must be you or the DM partner";
export const CONFLICT_DM_RECIPIENT =
  "In the selected DM, the recipient must be you or the DM partner";
export const CONFLICT_SAME_PERSON =
  "The sender and recipient must be different people";
// 選んだ条件だけで決まる、必ず空になる組み合わせ。計画の生成（検索語を含む）とフォームの検証が同じ検査を通る。
// channelScoped は範囲がチャンネル群、dmUserId は範囲（または検索欄の in:@相手）の DM の相手
export function scopeStructureConflicts(input: {
  channelScoped: boolean;
  dmUserId?: string;
  senderId?: string;
  recipient?: SearchRecipient;
  selfId: string;
}): string[] {
  const { channelScoped, dmUserId, senderId, recipient, selfId } = input;
  const conflicts: string[] = [];
  // 自分以外の人宛ては DM だけに当たるので、チャンネルの範囲とは両立しない
  if (recipient?.kind === "person" && channelScoped)
    conflicts.push(CONFLICT_PERSON_RECIPIENT_IN_CHANNELS);
  const recipientId =
    recipient?.kind === "me"
      ? selfId
      : recipient?.kind === "person"
        ? recipient.userId
        : undefined;
  // 1対1の DM の中のメッセージは「自分から相手」か「相手から自分」のどちらか。
  // 自分との DM は自分が相手側にも入るので、この検査はしない
  const inPartnerDm = dmUserId !== undefined && dmUserId !== selfId;
  if (inPartnerDm) {
    const parties = [dmUserId, selfId];
    if (senderId && !parties.includes(senderId))
      conflicts.push(CONFLICT_DM_SENDER);
    if (recipientId && !parties.includes(recipientId))
      conflicts.push(CONFLICT_DM_RECIPIENT);
  }
  // 同じ人が自分に宛てて送ることはない。自分が自分宛てにメンションすることはあるので、自分は DM の中だけ検査する
  if (
    senderId &&
    recipientId &&
    senderId === recipientId &&
    (senderId !== selfId || inPartnerDm)
  )
    conflicts.push(CONFLICT_SAME_PERSON);
  return conflicts;
}
export function resolveScope(
  scope: SearchScope,
  library: ChannelLibrary | undefined,
  conversations: readonly Conversation[],
): {
  resolved: ResolvedScope;
  unresolvedChannelIds: string[];
  missingSection: boolean;
  invalidSender: boolean;
  invalidRecipient: boolean;
  invalidDm: boolean;
} {
  const range = scope.range;
  const section =
    range.kind === "section"
      ? library?.sections.find((s) => s.id === range.sectionId)
      : undefined;
  const missingSection = scope.range.kind === "section" && !section;
  const requested =
    scope.range.kind === "all" || scope.range.kind === "dm"
      ? "all"
      : scope.range.kind === "favorites"
        ? (library?.favoriteChannelIds ?? [])
        : scope.range.kind === "section"
          ? (section?.channelIds ?? [])
          : [scope.range.channelId];
  const available = new Set(
    conversations
      .filter((c) => c.type !== "mpim" && validChannelId(c.id))
      .map((c) => c.id),
  );
  const unresolvedChannelIds =
    requested === "all"
      ? []
      : [...new Set(requested)].filter((id) => !available.has(id)).sort();
  const channelIds =
    requested === "all"
      ? "all"
      : [...new Set(requested)].filter((id) => available.has(id)).sort();
  const invalidSender =
    scope.senderId !== undefined && !validSenderId(scope.senderId);
  const invalidRecipient =
    scope.recipient?.kind === "person" &&
    !validSenderId(scope.recipient.userId);
  const invalidDm = range.kind === "dm" && !validSenderId(range.userId);
  // 不正な投稿者・宛先・DM の相手を取り除いて全体検索へ広げない。計画生成側で検索を停止する。
  const senderId = scope.senderId;
  const dmUserId = range.kind === "dm" ? range.userId : undefined;
  const recipient = scope.recipient;
  return {
    resolved: {
      // DM の範囲はチャンネルの絞り込みを持たない（DM の相手は dmUserId で持つ）
      channelIds,
      dmUserId,
      senderId,
      recipient,
      fingerprint: scopeFingerprint(channelIds, senderId, {
        dmUserId,
        recipient,
      }),
    },
    unresolvedChannelIds,
    missingSection,
    invalidSender,
    invalidRecipient,
    invalidDm,
  };
}
export function validateScopeSelection(
  scope: SearchScope,
  library: ChannelLibrary,
  conversations: readonly Conversation[],
  showMessages = false,
  selfId?: string,
): string | undefined {
  const range = scope.range;
  if (
    range.kind === "section" &&
    !library.sections.some((s) => s.id === range.sectionId)
  )
    return "Choose a section again";
  if (
    range.kind === "channel" &&
    !conversations.some((c) => c.id === range.channelId && c.type !== "mpim")
  )
    return "Choose a channel again";
  if (range.kind === "dm" && !validSenderId(range.userId))
    return "Choose a person again";
  if (scope.senderId !== undefined && !validSenderId(scope.senderId))
    return "Choose a sender again";
  if (
    scope.recipient?.kind === "person" &&
    !validSenderId(scope.recipient.userId)
  )
    return "Choose a recipient again";
  // 検索語に依らず空になる組み合わせは、適用の時点で案内する（selfId が分からなければ検査しない）
  if (selfId) {
    const [conflict] = scopeStructureConflicts({
      channelScoped: range.kind !== "all" && range.kind !== "dm",
      dmUserId: range.kind === "dm" ? range.userId : undefined,
      senderId: scope.senderId,
      recipient: scope.recipient,
      selfId,
    });
    if (conflict) return conflict;
  }
  if (
    showMessages &&
    range.kind === "all" &&
    !scope.senderId &&
    !scope.recipient
  )
    return "Select a scope, sender, or recipient";
  return undefined;
}
