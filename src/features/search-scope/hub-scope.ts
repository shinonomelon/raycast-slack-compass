import type { Conversation, Person } from "../../shared/types.ts";
import type { ChannelLibrary } from "../channel-library/model.ts";
import type { SearchScope } from "./model.ts";
// チャンネルだけを新しい正本へ切り替え、人物とグループDMの設定を残す。
export function hubFavorites(
  legacy: readonly string[],
  library: ChannelLibrary,
  ready: boolean,
  conversations: readonly Conversation[],
): string[] {
  const groups = new Set(
    conversations.filter((c) => c.type === "mpim").map((c) => c.id),
  );
  return [
    ...new Set([
      ...legacy.filter((id) => !/^[CG]/.test(id) || groups.has(id)),
      ...(ready ? library.favoriteChannelIds : []),
    ]),
  ];
}
const personName = (
  people: readonly Person[],
  id: string,
  fallback: string,
) => {
  const person = people.find((p) => p.id === id);
  return person?.displayName || person?.realName || person?.handle || fallback;
};
// 指定中の条件（検索欄の例文と Messages の見出しに出す）。例：All / From: Alice / To: Me。selfId が分かれば、自分は Me と出す
export function searchScopeTitle(
  scope: SearchScope,
  library: ChannelLibrary,
  conversations: readonly Conversation[],
  people: readonly Person[],
  selfId?: string,
): string {
  const range = scope.range;
  const label =
    range.kind === "all"
      ? "All"
      : range.kind === "favorites"
        ? "Favorite Channels"
        : range.kind === "section"
          ? (library.sections.find((s) => s.id === range.sectionId)?.name ??
            "Deleted Section")
          : range.kind === "dm"
            ? `DM: ${range.userId === selfId ? "Me" : personName(people, range.userId, "Selected Person")}`
            : `#${conversations.find((c) => c.id === range.channelId)?.name ?? "Unavailable Channel"}`;
  const parts = [label];
  if (scope.senderId)
    parts.push(
      `From: ${scope.senderId === selfId ? "Me" : personName(people, scope.senderId, "Selected Sender")}`,
    );
  if (scope.recipient)
    parts.push(
      `To: ${
        scope.recipient.kind === "me"
          ? "Me"
          : personName(people, scope.recipient.userId, "Selected Recipient")
      }`,
    );
  return parts.join(" / ");
}
// 一番上の画面のタイトルは変えない（Store のルール）ので、選んだ条件は検索欄の例文と Messages の見出しに出す。
// 既定（All・送信者なし・宛先なし）のときは何も足さない
export function activeScopeSummary(
  scope: SearchScope,
  title: string,
): string | undefined {
  return removableFilters(scope).length ? title : undefined;
}
export function hubSearchPlaceholder(summary: string | undefined): string {
  return summary ? `Search Slack · ${summary}` : "Search Slack";
}
export type RemovableFilter = "range" | "sender" | "recipient";
// 外せる条件。条件があるものだけを、範囲 → 送信者 → 宛先の順に返す
export function removableFilters(scope: SearchScope): RemovableFilter[] {
  return [
    ...(scope.range.kind !== "all" ? (["range"] as const) : []),
    ...(scope.senderId ? (["sender"] as const) : []),
    ...(scope.recipient ? (["recipient"] as const) : []),
  ];
}
// 条件を1つだけ外す。ほかの条件は残す（検索語は SearchScope の外にあるので、ここでは触れない）
export function removeScopeFilter(
  scope: SearchScope,
  filter: RemovableFilter,
): SearchScope {
  if (filter === "range") return { ...scope, range: { kind: "all" } };
  const { senderId, recipient, ...rest } = scope;
  return filter === "sender"
    ? { ...rest, ...(recipient ? { recipient } : {}) }
    : { ...rest, ...(senderId ? { senderId } : {}) };
}
// 1つのチャンネルに範囲を絞る。送信者と、自分宛ての宛先は残す（そのチャンネルでの自分へのメンションに絞れる）。
// 人宛てはチャンネルに当たらず必ず競合になるので、ここで外す
export function scopeForChannel(
  scope: SearchScope,
  channelId: string,
): SearchScope {
  const { recipient, ...rest } = scope;
  return {
    ...rest,
    range: { kind: "channel", channelId },
    ...(recipient?.kind === "me" ? { recipient } : {}),
  };
}
