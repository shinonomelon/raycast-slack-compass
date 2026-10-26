import { toItems } from "../../slack/items.ts";
import { rankItems } from "../search/search.ts";
import type { Person, Prefs } from "../../shared/types.ts";
import type { MembershipState } from "./membership.ts";
import { countLabel } from "../../shared/plural.ts";
export function memberRows(
  ids: readonly string[],
  people: readonly Person[],
  prefs: Prefs,
) {
  const known = new Map(people.map((person) => [person.id, person]));
  const rows = new Map(
    toItems([], people, prefs, []).map((row) => [row.id, row]),
  );
  return ids.map((id) => {
    const person = known.get(id);
    return {
      ...(rows.get(id) ?? {
        id,
        kind: "person" as const,
        title: id,
        keywords: [id],
        aliases: [],
      }),
      person,
      subtitle: person?.isBot
        ? "Bot"
        : person
          ? rows.get(id)?.subtitle
          : "Status Unknown",
      actionable: person !== undefined && !person.isBot,
    };
  });
}
export function allMatches<T extends Parameters<typeof rankItems>[0][number]>(
  rows: readonly T[],
  text: string,
): T[] {
  return rankItems(rows, text, rows.length);
}
export function membershipStatus(state: MembershipState): string {
  const time =
    state.fetchedAt === undefined
      ? ""
      : `Fetched at ${new Date(state.fetchedAt).toLocaleTimeString("en-US")}`;
  const previous = state.previous ? "Previous results · " : "";
  if (state.status === "loading")
    return `${previous}Refreshing${time ? ` · ${time}` : ""}`;
  if (state.status === "rate-limited" || state.status === "deferred")
    // 待ち秒数が無い状態でも undefined を出さないよう、そのときは「Retry in」ごと省く
    return `${previous}${state.error}${state.retryAfter === undefined ? "" : ` · Retry in ${countLabel(state.retryAfter, "second")}`}${time ? ` · ${time}` : ""}`;
  if (state.status === "failed" || state.status === "auth-required")
    return `${previous}${state.error ?? "Check authentication preferences and reopen Slack Compass"}${time ? ` · ${time}` : ""}`;
  return `${countLabel(state.data.length, "result")}${time ? ` · ${time}` : ""}`;
}
