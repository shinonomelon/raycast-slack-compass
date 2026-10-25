import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScope,
  scopeFingerprint,
  validateScopeSelection,
  type SearchScope,
} from "./model.ts";
import { createMessageSearchPlan } from "./search-plan.ts";
import type { FilterSource } from "../search/query.ts";
const library = {
  version: 1 as const,
  teamId: "T1",
  userId: "U1",
  favoriteChannelIds: ["C2", "C1", "C2", "C3"],
  sections: [{ id: "s", name: "開発", channelIds: ["C1", "C2"] }],
};
const conversations = [
  { id: "C1", name: "one", type: "public" as const },
  { id: "C2", name: "two", type: "private" as const },
];
const sources: FilterSource[] = [
  { id: "C1", kind: "channel", title: "one", token: "#one", keywords: ["one"] },
  { id: "C2", kind: "private", title: "two", token: "#two", keywords: ["two"] },
  {
    id: "U2",
    kind: "person",
    title: "alice",
    token: "@alice",
    keywords: ["alice"],
  },
];
const scope = resolveScope(
  { range: { kind: "section", sectionId: "s" }, senderId: "U2" },
  library,
  conversations,
).resolved;
const plan = (text: string) =>
  createMessageSearchPlan({ text, scope, sources, selfId: "U1" });
test("範囲は重複除去し未解決IDを残す", () => {
  const result = resolveScope(
    { range: { kind: "favorites" } },
    library,
    conversations,
  );
  assert.deepEqual(result.resolved.channelIds, ["C1", "C2"]);
  assert.deepEqual(result.unresolvedChannelIds, ["C3"]);
});
test("空範囲と全体、名前変更と所属変更を区別する", () => {
  assert.notEqual(scopeFingerprint([]), scopeFingerprint("all"));
  assert.equal(
    scopeFingerprint(["C2", "C1", "C1"]),
    scopeFingerprint(["C1", "C2"]),
  );
  const selection: SearchScope = { range: { kind: "section", sectionId: "s" } };
  const before = resolveScope(selection, library, conversations).resolved
    .fingerprint;
  assert.equal(
    resolveScope(
      selection,
      { ...library, sections: [{ ...library.sections[0], name: "別名" }] },
      conversations,
    ).resolved.fingerprint,
    before,
  );
  assert.notEqual(
    resolveScope(
      selection,
      {
        ...library,
        sections: [{ ...library.sections[0], channelIds: ["C1"] }],
      },
      conversations,
    ).resolved.fingerprint,
    before,
  );
  assert.equal(
    resolveScope(
      { range: { kind: "section", sectionId: "missing" } },
      library,
      conversations,
    ).missingSection,
    true,
  );
});
test("通常検索は自由語とチャンネルと投稿者をANDで結合する", () => {
  assert.deepEqual(plan("議事録").queries, [
    "議事録 in:<#C1> from:<@U2>",
    "議事録 in:<#C2> from:<@U2>",
  ]);
  assert.equal(plan("").canSearch, true);
  assert.deepEqual(plan("in:#one from:@alice ").queries, [
    "in:<#C1> from:<@U2>",
  ]);
  assert.equal(plan("in:<#C3> ").empty, true);
  assert.equal(plan("from:<@U3> ").empty, true);
  assert.equal(plan("in:@alice ").empty, true);
});
test("否定条件を保持し複数、括弧、未確定条件は送らない", () => {
  assert.match(
    plan("-in:#one -from:@alice ").queries[0],
    /^-in:<#C1> -from:<@U2>/,
  );
  for (const text of [
    "in:#one in:#two ",
    "(in:#one OR in:#two)",
    "in:#unknown ",
    "in: ",
    "from: ",
    "from:@alice",
  ]) {
    assert.equal(plan(text).canSearch, false, text);
    assert.ok(plan(text).conflicts.length, text);
  }
});
test("条件なしは既存resolverと1文字ガードを維持する", () => {
  const scope = resolveScope(
    { range: { kind: "all" } },
    library,
    conversations,
  ).resolved;
  assert.deepEqual(
    createMessageSearchPlan({
      text: "from:@alice ",
      scope,
      sources,
      selfId: "U1",
    }).queries,
    ["from:<@U2>"],
  );
  assert.equal(
    createMessageSearchPlan({ text: "a", scope, sources, selfId: "U1" })
      .canSearch,
    false,
  );
});

test("構造化条件とOR/括弧の自由語は競合し引用内は維持する", () => {
  for (const text of ["foo OR bar", "(foo bar)", "-in:#one OR foo"])
    assert.equal(plan(text).canSearch, false, text);
  assert.equal(plan('"foo OR bar"').canSearch, true);
  assert.equal(plan('"(foo)"').canSearch, true);
  assert.match(scopeFingerprint(["C1"], "U2"), /^[a-f0-9]{64}$/);
});

test("構造化条件でorを含む確定フィルター値は検索でき、独立ORは引き続き拒否する", () => {
  const filterSources: FilterSource[] = [
    ...sources,
    {
      id: "C1",
      kind: "channel",
      title: "foo-or-bar",
      token: "#foo-or-bar",
      keywords: ["foo-or-bar"],
    },
    { id: "U2", kind: "person", title: "or", token: "@or", keywords: ["or"] },
  ];
  const search = (text: string) =>
    createMessageSearchPlan({
      text,
      scope,
      sources: filterSources,
      selfId: "U1",
    });
  assert.deepEqual(search("in:#foo-or-bar ").queries, ["in:<#C1> from:<@U2>"]);
  assert.deepEqual(search("from:@or ").queries, [
    "in:<#C1> from:<@U2>",
    "in:<#C2> from:<@U2>",
  ]);
  assert.equal(search("in:#foo-or-bar OR from:@or ").canSearch, false);
  assert.equal(search("from:@or or foo ").canSearch, false);
  assert.equal(search('"foo OR bar" from:@or ').canSearch, true);
});

test("条件フォームは新セクションを受け入れ削除済み選択を拒否する", () => {
  const selected: SearchScope = {
    range: { kind: "section", sectionId: "new" },
  };
  assert.ok(validateScopeSelection(selected, library, conversations));
  const updated = {
    ...library,
    sections: [
      ...library.sections,
      { id: "new", name: "追加", channelIds: [] },
    ],
  };
  assert.equal(
    validateScopeSelection(selected, updated, conversations),
    undefined,
  );
  assert.ok(
    validateScopeSelection(
      selected,
      { ...updated, sections: [] },
      conversations,
    ),
  );
  assert.ok(
    validateScopeSelection(
      { range: { kind: "all" } },
      library,
      conversations,
      true,
    ),
  );
  assert.equal(
    validateScopeSelection(
      { range: { kind: "all" }, senderId: "U2" },
      library,
      conversations,
      true,
    ),
    undefined,
  );
});

// 選んだ範囲・送信者・宛先から、Slack へ渡す検索式を作る。selfId は U1、alice は U2、bob は U3
const people: FilterSource[] = [
  ...sources,
  {
    id: "U3",
    kind: "person",
    title: "bob",
    token: "@bob",
    keywords: ["bob"],
  },
];
function planFor(selected: SearchScope, text = "") {
  const resolved = resolveScope(selected, library, conversations).resolved;
  return createMessageSearchPlan({
    text,
    scope: resolved,
    sources: people,
    selfId: "U1",
  });
}
const all: SearchScope["range"] = { kind: "all" };
const group: SearchScope["range"] = { kind: "section", sectionId: "s" };

test("送信者 Me は from:<@自分> で検索し、検索語と組み合わせる", () => {
  assert.deepEqual(planFor({ range: all, senderId: "U1" }).queries, [
    "from:<@U1>",
  ]);
  assert.deepEqual(planFor({ range: all, senderId: "U1" }, "議事録").queries, [
    "議事録 from:<@U1>",
  ]);
  assert.deepEqual(
    planFor({ range: group, senderId: "U1" }, "議事録").queries,
    ["議事録 in:<#C1> from:<@U1>", "議事録 in:<#C2> from:<@U1>"],
  );
});

test("宛先 Me は範囲 All のとき、メンションと DM の2本に分ける", () => {
  const recipient = { kind: "me" as const };
  assert.deepEqual(planFor({ range: all, recipient }).queries, [
    "<@U1> -from:me",
    "to:<@U1> -from:me",
  ]);
  assert.deepEqual(planFor({ range: all, recipient }, "議事録").queries, [
    "議事録 <@U1> -from:me",
    "議事録 to:<@U1> -from:me",
  ]);
  // 送信者を選んだときは、-from:me を付けない（送信者の指定と矛盾させない）
  assert.deepEqual(planFor({ range: all, recipient, senderId: "U2" }).queries, [
    "<@U1> from:<@U2>",
    "from:<@U2> to:<@U1>",
  ]);
});

test("宛先 Me は範囲がチャンネル群のとき、チャンネルごとのメンションだけを検索する（to: は足さない）", () => {
  const recipient = { kind: "me" as const };
  assert.deepEqual(planFor({ range: group, recipient }).queries, [
    "<@U1> in:<#C1> -from:me",
    "<@U1> in:<#C2> -from:me",
  ]);
  assert.deepEqual(
    planFor({ range: { kind: "channel", channelId: "C2" }, recipient }, "請求")
      .queries,
    ["請求 <@U1> in:<#C2> -from:me"],
  );
  assert.deepEqual(
    planFor({ range: group, recipient, senderId: "U2" }).queries,
    ["<@U1> in:<#C1> from:<@U2>", "<@U1> in:<#C2> from:<@U2>"],
  );
  assert.ok(
    planFor({ range: group, recipient }).queries.every(
      (q) => !q.includes("to:"),
    ),
  );
});

test("宛先が人のときは to:<@その人> で、範囲 All でだけ検索できる", () => {
  const recipient = { kind: "person" as const, userId: "U2" };
  assert.deepEqual(planFor({ range: all, recipient }).queries, ["to:<@U2>"]);
  assert.deepEqual(planFor({ range: all, recipient }, "確認").queries, [
    "確認 to:<@U2>",
  ]);
  assert.deepEqual(planFor({ range: all, recipient, senderId: "U1" }).queries, [
    "from:<@U1> to:<@U2>",
  ]);
  // チャンネルには DM が無いので、結果が必ず空になる組み合わせは案内する
  const blocked = planFor({ range: group, recipient });
  assert.equal(blocked.canSearch, false);
  assert.deepEqual(blocked.queries, []);
  assert.deepEqual(blocked.conflicts, [
    "A recipient other than you matches DMs only. Set the scope to All or a DM",
  ]);
});

test("範囲が DM のときは in:<@相手> で検索し、送信者・宛先と組み合わせる", () => {
  const dm: SearchScope["range"] = { kind: "dm", userId: "U2" };
  assert.deepEqual(planFor({ range: dm }).queries, ["in:<@U2>"]);
  assert.deepEqual(planFor({ range: dm }, "請求").queries, ["請求 in:<@U2>"]);
  assert.deepEqual(planFor({ range: dm, senderId: "U1" }).queries, [
    "in:<@U2> from:<@U1>",
  ]);
  assert.deepEqual(planFor({ range: dm, recipient: { kind: "me" } }).queries, [
    "in:<@U2> to:<@U1> -from:me",
  ]);
  assert.deepEqual(
    planFor({ range: dm, recipient: { kind: "person", userId: "U2" } }).queries,
    ["in:<@U2> to:<@U2>"],
  );
  assert.deepEqual(
    planFor({
      range: dm,
      senderId: "U2",
      recipient: { kind: "me" },
    }).queries,
    ["in:<@U2> from:<@U2> to:<@U1>"],
  );
  assert.equal(planFor({ range: dm }).scope.dmUserId, "U2");
});

test("DM の中身と矛盾する送信者・宛先の組み合わせは競合として案内する", () => {
  const dm: SearchScope["range"] = { kind: "dm", userId: "U2" };
  const conflictsOf = (selected: SearchScope) => {
    const result = planFor(selected);
    assert.equal(result.canSearch, false);
    assert.deepEqual(result.queries, []);
    return result.conflicts;
  };
  assert.deepEqual(conflictsOf({ range: dm, senderId: "U3" }), [
    "In the selected DM, the sender must be you or the DM partner",
  ]);
  assert.deepEqual(
    conflictsOf({ range: dm, recipient: { kind: "person", userId: "U3" } }),
    ["In the selected DM, the recipient must be you or the DM partner"],
  );
  assert.deepEqual(
    conflictsOf({ range: dm, senderId: "U1", recipient: { kind: "me" } }),
    ["The sender and recipient must be different people"],
  );
  // 手入力の from: で送信者が決まった場合も同じ検査を通る
  assert.deepEqual(planFor({ range: dm }, "from:@bob ").conflicts, [
    "In the selected DM, the sender must be you or the DM partner",
  ]);
});

test("手入力の in: は範囲の DM と同じ相手なら重ねず、別の相手やチャンネルなら空にする", () => {
  const dm: SearchScope["range"] = { kind: "dm", userId: "U2" };
  assert.deepEqual(planFor({ range: dm }, "in:@alice ").queries, ["in:<@U2>"]);
  assert.equal(planFor({ range: dm }, "in:@bob ").empty, true);
  assert.equal(planFor({ range: dm }, "in:#one ").empty, true);
});

test("宛先を選んでいるとき、検索欄の to: は競合として外し方を案内する", () => {
  const message =
    "The to: filter in the search bar conflicts with the selected recipient. Delete the to: filter or choose Remove Recipient Filter";
  for (const text of ["to:@bob ", "to:me ", "to:", "to:@bo"]) {
    const result = planFor({ range: all, recipient: { kind: "me" } }, text);
    assert.equal(result.canSearch, false, text);
    assert.deepEqual(result.conflicts, [message], text);
  }
  assert.deepEqual(
    planFor(
      { range: all, recipient: { kind: "person", userId: "U2" } },
      "to:@bob ",
    ).conflicts,
    [message],
  );
  // 否定の to: は宛先と矛盾しない
  assert.deepEqual(
    planFor({ range: all, recipient: { kind: "me" } }, "-to:@bob ").queries,
    ["-to:<@U3> <@U1> -from:me", "-to:<@U3> to:<@U1> -from:me"],
  );
});

test("宛先を選んでいなければ、手入力の to: は今までどおり検索式へ変換する", () => {
  // 条件なし：検索欄の解釈だけで検索する
  assert.deepEqual(planFor({ range: all }, "to:@bob ").queries, ["to:<@U3>"]);
  assert.deepEqual(planFor({ range: all }, "to:me ").queries, ["to:<@U1>"]);
  // 送信者や範囲を選んでいても、to: はそのまま残る
  assert.deepEqual(
    planFor({ range: all, senderId: "U2" }, "to:@bob ").queries,
    ["to:<@U3> from:<@U2>"],
  );
  assert.deepEqual(planFor({ range: group }, "to:me 請求").queries, [
    "to:<@U1> 請求 in:<#C1>",
    "to:<@U1> 請求 in:<#C2>",
  ]);
});

test("宛先と DM が計画の範囲・指紋に入り、条件が違えば指紋も違う", () => {
  const base = planFor({ range: all }).scope.fingerprint;
  const withMe = planFor({ range: all, recipient: { kind: "me" } }).scope;
  const withPerson = planFor({
    range: all,
    recipient: { kind: "person", userId: "U2" },
  }).scope;
  const withDm = planFor({ range: { kind: "dm", userId: "U2" } }).scope;
  assert.deepEqual(withMe.recipient, { kind: "me" });
  assert.deepEqual(withPerson.recipient, { kind: "person", userId: "U2" });
  assert.equal(withDm.dmUserId, "U2");
  assert.equal(
    new Set([
      base,
      withMe.fingerprint,
      withPerson.fingerprint,
      withDm.fingerprint,
    ]).size,
    4,
  );
});

test("形式が不正な宛先・DM の相手は検索せず案内する", () => {
  for (const selected of [
    { range: all, recipient: { kind: "person" as const, userId: "bad" } },
    { range: { kind: "dm" as const, userId: "bad" } },
  ]) {
    const result = planFor(selected);
    assert.equal(result.canSearch, false);
    assert.deepEqual(result.queries, []);
    assert.ok(result.conflicts.includes("Invalid search filter ID"));
  }
});

test("検索欄の in:@相手（DM）が1つだけのときも、範囲の DM と同じ検査にかける", () => {
  // 送信者 bob は alice との DM には現れない
  assert.deepEqual(
    planFor({ range: all, senderId: "U3" }, "in:@alice ").conflicts,
    ["In the selected DM, the sender must be you or the DM partner"],
  );
  assert.deepEqual(
    planFor(
      { range: all, recipient: { kind: "person", userId: "U3" } },
      "in:@alice ",
    ).conflicts,
    ["In the selected DM, the recipient must be you or the DM partner"],
  );
  // 組み合わせが合うなら、今までどおり検索式へ入る
  assert.deepEqual(
    planFor({ range: all, senderId: "U2" }, "in:@alice ").queries,
    ["in:<@U2> from:<@U2>"],
  );
  assert.deepEqual(
    planFor({ range: all, recipient: { kind: "me" } }, "in:@alice ").queries,
    ["in:<@U2> <@U1> -from:me", "in:<@U2> to:<@U1> -from:me"],
  );
});

test("送信者と宛先に同じ他人を選ぶと、範囲に関わらず競合にする", () => {
  const same = "The sender and recipient must be different people";
  for (const range of [all, group, { kind: "dm" as const, userId: "U3" }]) {
    const result = planFor({
      range,
      senderId: "U2",
      recipient: { kind: "person", userId: "U2" },
    });
    assert.equal(result.canSearch, false);
    assert.ok(result.conflicts.includes(same), JSON.stringify(range));
  }
  // 自分が自分宛て（メンション）は、DM の外では矛盾しない
  assert.deepEqual(
    planFor({ range: all, senderId: "U1", recipient: { kind: "me" } }).queries,
    ["<@U1> from:<@U1>", "from:<@U1> to:<@U1>"],
  );
});

test("検索欄の in:#チャンネル で人宛てと競合したときは、検索欄の in: を外すよう案内する", () => {
  const result = planFor(
    { range: all, recipient: { kind: "person", userId: "U2" } },
    "in:#one ",
  );
  assert.equal(result.canSearch, false);
  assert.deepEqual(result.conflicts, [
    "A recipient other than you matches DMs only. Delete the in: filter for a channel from the search bar",
  ]);
});

test("DM の範囲で宛先 Me のときも、送信者を選んでいなければ -from:me を付ける", () => {
  assert.deepEqual(
    planFor({ range: { kind: "dm", userId: "U2" }, recipient: { kind: "me" } })
      .queries,
    ["in:<@U2> to:<@U1> -from:me"],
  );
  // 自分との DM は自分の投稿だけなので除外しない
  assert.deepEqual(
    planFor({ range: { kind: "dm", userId: "U1" }, recipient: { kind: "me" } })
      .queries,
    ["in:<@U1> to:<@U1>"],
  );
});
