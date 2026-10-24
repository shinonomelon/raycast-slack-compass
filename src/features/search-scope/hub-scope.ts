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
export function searchScopeTitle(
  scope: SearchScope,
  library: ChannelLibrary,
  conversations: readonly Conversation[],
  people: readonly Person[],
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
          : `#${conversations.find((c) => c.id === range.channelId)?.name ?? "Unavailable Channel"}`;
  const sender = people.find((p) => p.id === scope.senderId);
  return scope.senderId
    ? `${label} / ${sender?.displayName || sender?.realName || sender?.handle || "Selected Sender"}`
    : label;
}
