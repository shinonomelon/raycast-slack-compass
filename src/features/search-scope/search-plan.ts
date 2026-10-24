import {
  parseQuery,
  resolveQuery,
  type FilterSource,
} from "../search/query.ts";
import {
  scopeFingerprint,
  validChannelId,
  validSenderId,
  type ResolvedScope,
} from "./model.ts";
export type MessageSearchPlan = {
  queries: string[];
  resolvedQuery: string;
  conflicts: string[];
  empty: boolean;
  canSearch: boolean;
  scope: ResolvedScope;
};
export function createMessageSearchPlan({
  text,
  scope,
  sources,
  selfId,
}: {
  text: string;
  scope: ResolvedScope;
  sources: readonly FilterSource[];
  selfId: string;
}): MessageSearchPlan {
  const structured = scope.channelIds !== "all" || scope.senderId !== undefined;
  const resolved = resolveQuery(text, sources, selfId);
  const conflicts: string[] = [];
  const finish = (
    queries: string[],
    channels = scope.channelIds,
    senderId = scope.senderId,
  ): MessageSearchPlan => ({
    queries,
    resolvedQuery: resolved.query,
    conflicts,
    empty: queries.length === 0 && conflicts.length === 0,
    canSearch: queries.length > 0 && conflicts.length === 0,
    scope: {
      channelIds: channels,
      senderId,
      fingerprint: scopeFingerprint(channels, senderId),
    },
  });
  if (!structured)
    return finish(
      text.trim().length > 1 && resolved.query ? [resolved.query] : [],
    );
  if (
    (scope.senderId !== undefined && !validSenderId(scope.senderId)) ||
    (scope.channelIds !== "all" &&
      scope.channelIds.some((id) => !validChannelId(id)))
  )
    conflicts.push("Invalid search filter ID");
  const positive = parseQuery(text).tokens.filter(
    (t) =>
      t.type === "filter" &&
      !t.negated &&
      (t.modifier === "in" || t.modifier === "from"),
  );
  if (
    ["in", "from"].some(
      (modifier) =>
        positive.filter((t) => t.type === "filter" && t.modifier === modifier)
          .length > 1,
    )
  )
    conflicts.push(
      "Multiple in/from filters cannot be combined with selected filters",
    );
  // 括弧・ORによる結合は既存の単語resolverでは意味を保証できない。
  const unquoted = text.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, "");
  const hasOr = parseQuery(unquoted).tokens.some(
    (token) => token.type === "text" && /^OR$/i.test(token.raw),
  );
  if (/[()]/.test(unquoted) || hasOr)
    conflicts.push("Change the parentheses or OR conditions");
  if (
    resolved.unresolved.some(
      (t) => t.modifier === "in" || t.modifier === "from",
    ) ||
    (resolved.completing &&
      (resolved.completing.modifier === "in" ||
        resolved.completing.modifier === "from"))
  )
    conflicts.push("Resolve the target of the in/from filter");
  if (positive.some((token) => token.type === "filter" && !token.value.trim()))
    conflicts.push("Enter a value for the in/from filter");
  if (conflicts.length) return finish([]);
  let channels = scope.channelIds;
  let senderId = scope.senderId;
  let empty = false;
  const retained: string[] = [];
  for (const token of parseQuery(resolved.query).tokens) {
    if (
      token.type !== "filter" ||
      token.negated ||
      (token.modifier !== "in" && token.modifier !== "from")
    ) {
      retained.push(token.raw);
      continue;
    }
    const channel = /^<#([CG][A-Z0-9]+)(?:\|[^>]*)?>$/.exec(token.value);
    const user = /^<@([UW][A-Z0-9]+)(?:\|[^>]*)?>$/.exec(token.value);
    if (token.modifier === "in" && channel) {
      channels =
        channels === "all"
          ? [channel[1]]
          : channels.filter((id) => id === channel[1]);
    } else if (token.modifier === "in" && user) {
      if (channels === "all") retained.push(token.raw);
      else empty = true;
    } else if (token.modifier === "from" && (user || token.value === "me")) {
      const id = user?.[1] ?? selfId;
      if (senderId && senderId !== id) empty = true;
      else senderId = id;
    } else {
      conflicts.push("Could not safely interpret the in/from filter");
    }
  }
  if (empty || conflicts.length) return finish([], channels, senderId);
  const suffix = senderId ? `from:<@${senderId}>` : "";
  const query = (channelId?: string) =>
    [
      ...retained,
      ...(channelId ? [`in:<#${channelId}>`] : []),
      ...(suffix ? [suffix] : []),
    ].join(" ");
  return finish(
    channels === "all" ? [query()] : channels.map((id) => query(id)),
    channels,
    senderId,
  );
}
