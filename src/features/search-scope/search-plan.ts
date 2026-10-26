import {
  parseQuery,
  resolveQuery,
  type FilterSource,
} from "../search/query.ts";
import {
  CONFLICT_PERSON_RECIPIENT_TYPED_CHANNEL,
  hasStructuredScope,
  scopeStructureConflicts,
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
  const structured = hasStructuredScope(scope);
  const resolved = resolveQuery(text, sources, selfId);
  const conflicts: string[] = [];
  const finish = (
    queries: string[],
    channels = scope.channelIds,
    senderId = scope.senderId,
    dmUserId = scope.dmUserId,
  ): MessageSearchPlan => ({
    queries,
    resolvedQuery: resolved.query,
    conflicts,
    empty: queries.length === 0 && conflicts.length === 0,
    canSearch: queries.length > 0 && conflicts.length === 0,
    scope: {
      channelIds: channels,
      dmUserId,
      senderId,
      recipient: scope.recipient,
      fingerprint: scopeFingerprint(channels, senderId, {
        dmUserId,
        recipient: scope.recipient,
      }),
    },
  });
  if (!structured)
    return finish(
      text.trim().length > 1 && resolved.query ? [resolved.query] : [],
    );
  if (
    (scope.senderId !== undefined && !validSenderId(scope.senderId)) ||
    (scope.dmUserId !== undefined && !validSenderId(scope.dmUserId)) ||
    (scope.recipient?.kind === "person" &&
      !validSenderId(scope.recipient.userId)) ||
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
  // 宛先を選んでいるときの検索欄の to: は、どちらの宛先を使うか決められない。外す側を案内する。
  // 宛先を選んでいなければ、検索欄の to: は今までどおり resolveQuery の結果をそのまま送る
  if (
    scope.recipient &&
    parseQuery(text).tokens.some(
      (t) => t.type === "filter" && !t.negated && t.modifier === "to",
    )
  )
    conflicts.push(
      "The to: filter in the search bar conflicts with the selected recipient. Delete the to: filter or choose Remove Recipient Filter",
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
  const dmUserId = scope.dmUserId;
  // 検索欄の in:@相手（DM）が1つだけのとき、その相手。範囲の DM と同じ検査にかける
  let typedDmUserId: string | undefined;
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
      // DM とチャンネルは同時に満たせない
      if (dmUserId) empty = true;
      else
        channels =
          channels === "all"
            ? [channel[1]]
            : channels.filter((id) => id === channel[1]);
    } else if (token.modifier === "in" && user) {
      // 範囲の DM と同じ相手なら、検索式に範囲の in: が入るので重ねない。別の相手なら空になる
      if (dmUserId) {
        if (dmUserId !== user[1]) empty = true;
      } else if (channels === "all") {
        retained.push(token.raw);
        typedDmUserId = user[1];
      } else empty = true;
    } else if (token.modifier === "from" && (user || token.value === "me")) {
      const id = user?.[1] ?? selfId;
      if (senderId && senderId !== id) empty = true;
      else senderId = id;
    } else {
      conflicts.push("Could not safely interpret the in/from filter");
    }
  }
  const recipient = scope.recipient;
  // 選んだ範囲・送信者・宛先（と、検索欄の from:・in:@相手）だけで必ず空になる組み合わせを案内する
  conflicts.push(
    ...scopeStructureConflicts({
      channelScoped: scope.channelIds !== "all",
      dmUserId: dmUserId ?? typedDmUserId,
      senderId,
      recipient,
      selfId,
    }),
  );
  // 範囲は All のまま、検索欄の in:#チャンネル で絞った場合は、外す先が検索欄になる
  if (
    recipient?.kind === "person" &&
    scope.channelIds === "all" &&
    channels !== "all"
  )
    conflicts.push(CONFLICT_PERSON_RECIPIENT_TYPED_CHANNEL);
  if (empty || conflicts.length)
    return finish([], channels, senderId, dmUserId);
  const suffix = senderId ? `from:<@${senderId}>` : "";
  // 並びは 自由語 → 宛先のメンション → in: → from: → to: → 自分の投稿の除外。
  // 自分宛ての検索には自分の投稿が混ざるので、送信者を選んでいないときは -from:me で除く（自分宛て一覧と同じ）。
  // 自分との DM は自分の投稿だけなので、除外しない
  const query = (
    options: {
      channelId?: string;
      mention?: boolean;
      to?: string;
      excludeSelf?: boolean;
    } = {},
  ) =>
    [
      ...retained,
      ...(options.mention ? [`<@${selfId}>`] : []),
      ...(options.channelId ? [`in:<#${options.channelId}>`] : []),
      ...(dmUserId ? [`in:<@${dmUserId}>`] : []),
      ...(suffix ? [suffix] : []),
      ...(options.to ? [`to:<@${options.to}>`] : []),
      ...(options.excludeSelf && !senderId && dmUserId !== selfId
        ? ["-from:me"]
        : []),
    ].join(" ");
  let queries: string[];
  if (recipient?.kind === "person") {
    // 人宛て：その人へ送られた DM（チャンネルの範囲は上で競合にしている）
    queries = [query({ to: recipient.userId })];
  } else if (recipient?.kind === "me") {
    // 自分宛て：メンション（<@自分>）と DM（to:<@自分>）の2本。to: はチャンネルと両立しないので、
    // 範囲がチャンネル群のときはチャンネルごとのメンションの検索だけにする
    queries =
      channels !== "all"
        ? channels.map((channelId) =>
            query({ channelId, mention: true, excludeSelf: true }),
          )
        : dmUserId
          ? [query({ to: selfId, excludeSelf: true })]
          : [
              query({ mention: true, excludeSelf: true }),
              query({ to: selfId, excludeSelf: true }),
            ];
  } else {
    queries =
      channels === "all"
        ? [query()]
        : channels.map((channelId) => query({ channelId }));
  }
  return finish(queries, channels, senderId, dmUserId);
}
