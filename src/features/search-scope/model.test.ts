import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasStructuredScope,
  resolveScope,
  scopeFingerprint,
  scopeStructureConflicts,
  validateScopeSelection,
  type SearchScope,
} from "./model.ts";

const library = {
  version: 1 as const,
  teamId: "T1",
  userId: "U1",
  favoriteChannelIds: [],
  sections: [{ id: "s", name: "dev", channelIds: ["C1"] }],
};
const conversations = [{ id: "C1", name: "one", type: "public" as const }];

test("宛先の無い従来の条件も、そのまま解決できる（recipient は任意）", () => {
  // 宛先と DM が入る前の形のデータ
  const legacy: SearchScope = {
    range: { kind: "section", sectionId: "s" },
    senderId: "U2",
  };
  const { resolved, invalidRecipient, invalidDm } = resolveScope(
    legacy,
    library,
    conversations,
  );
  assert.deepEqual(resolved.channelIds, ["C1"]);
  assert.equal(resolved.senderId, "U2");
  assert.equal(resolved.recipient, undefined);
  assert.equal(resolved.dmUserId, undefined);
  assert.equal(invalidRecipient, false);
  assert.equal(invalidDm, false);
});

test("DM の範囲はチャンネルを絞り込まず、相手を dmUserId に持つ", () => {
  const result = resolveScope(
    { range: { kind: "dm", userId: "U2" } },
    library,
    conversations,
  );
  assert.equal(result.resolved.channelIds, "all");
  assert.equal(result.resolved.dmUserId, "U2");
  assert.deepEqual(result.unresolvedChannelIds, []);
  assert.equal(hasStructuredScope(result.resolved), true);
});

test("宛先を解決結果に引き継ぎ、形式が不正な宛先と DM の相手を知らせる", () => {
  const me = resolveScope(
    { range: { kind: "all" }, recipient: { kind: "me" } },
    library,
    conversations,
  );
  assert.deepEqual(me.resolved.recipient, { kind: "me" });
  assert.equal(hasStructuredScope(me.resolved), true);
  assert.equal(
    resolveScope(
      { range: { kind: "all" }, recipient: { kind: "person", userId: "x" } },
      library,
      conversations,
    ).invalidRecipient,
    true,
  );
  assert.equal(
    resolveScope({ range: { kind: "dm", userId: "x" } }, library, conversations)
      .invalidDm,
    true,
  );
  assert.equal(
    hasStructuredScope(
      resolveScope({ range: { kind: "all" } }, library, conversations).resolved,
    ),
    false,
  );
});

test("指紋は宛先・DM・送信者のどれが違っても別になり、同じ条件なら同じになる", () => {
  const prints = [
    scopeFingerprint("all"),
    scopeFingerprint("all", "U2"),
    scopeFingerprint("all", undefined, { recipient: { kind: "me" } }),
    scopeFingerprint("all", undefined, {
      recipient: { kind: "person", userId: "U2" },
    }),
    scopeFingerprint("all", undefined, { dmUserId: "U2" }),
    scopeFingerprint("all", undefined, { dmUserId: "U3" }),
  ];
  assert.equal(new Set(prints).size, prints.length);
  assert.equal(
    scopeFingerprint(["C2", "C1"], "U2", { recipient: { kind: "me" } }),
    scopeFingerprint(["C1", "C2", "C1"], "U2", { recipient: { kind: "me" } }),
  );
  assert.match(prints[0], /^[a-f0-9]{64}$/);
});

test("条件フォームの検証は DM の相手と宛先の形式を見て、メッセージ表示には何か1つの条件を求める", () => {
  assert.equal(
    validateScopeSelection(
      { range: { kind: "dm", userId: "U2" } },
      library,
      conversations,
      true,
    ),
    undefined,
  );
  assert.equal(
    validateScopeSelection(
      { range: { kind: "dm", userId: "" } },
      library,
      conversations,
    ),
    "Choose a person again",
  );
  assert.equal(
    validateScopeSelection(
      { range: { kind: "all" }, recipient: { kind: "person", userId: "" } },
      library,
      conversations,
    ),
    "Choose a recipient again",
  );
  assert.equal(
    validateScopeSelection(
      { range: { kind: "all" } },
      library,
      conversations,
      true,
    ),
    "Select a scope, sender, or recipient",
  );
  assert.equal(
    validateScopeSelection(
      { range: { kind: "all" }, recipient: { kind: "me" } },
      library,
      conversations,
      true,
    ),
    undefined,
  );
});

test("検索語に依らず空になる組み合わせは、フォームの検証でも英語で案内する", () => {
  const check = (scope: SearchScope, showMessages = false) =>
    validateScopeSelection(scope, library, conversations, showMessages, "U1");
  const person = { kind: "person" as const, userId: "U2" };
  assert.equal(
    check({ range: { kind: "channel", channelId: "C1" }, recipient: person }),
    "A recipient other than you matches DMs only. Set the scope to All or a DM",
  );
  assert.equal(
    check(
      { range: { kind: "section", sectionId: "s" }, recipient: person },
      true,
    ),
    "A recipient other than you matches DMs only. Set the scope to All or a DM",
  );
  assert.equal(
    check({ range: { kind: "dm", userId: "U2" }, senderId: "U3" }),
    "In the selected DM, the sender must be you or the DM partner",
  );
  assert.equal(
    check({
      range: { kind: "dm", userId: "U2" },
      recipient: { kind: "person", userId: "U3" },
    }),
    "In the selected DM, the recipient must be you or the DM partner",
  );
  assert.equal(
    check({ range: { kind: "all" }, senderId: "U2", recipient: person }),
    "The sender and recipient must be different people",
  );
  // 通る組み合わせ
  for (const scope of [
    { range: { kind: "all" as const }, recipient: person },
    {
      range: { kind: "channel" as const, channelId: "C1" },
      recipient: { kind: "me" as const },
    },
    {
      range: { kind: "dm" as const, userId: "U2" },
      senderId: "U1",
      recipient: person,
    },
    {
      range: { kind: "all" as const },
      senderId: "U1",
      recipient: { kind: "me" as const },
    },
  ])
    assert.equal(check(scope), undefined, JSON.stringify(scope));
  // selfId が無ければ、この検査はしない
  assert.equal(
    validateScopeSelection(
      { range: { kind: "channel", channelId: "C1" }, recipient: person },
      library,
      conversations,
    ),
    undefined,
  );
});

test("構造上の競合は、複数あれば全部返す", () => {
  assert.deepEqual(
    scopeStructureConflicts({
      channelScoped: false,
      dmUserId: "U2",
      senderId: "U3",
      recipient: { kind: "person", userId: "U3" },
      selfId: "U1",
    }),
    [
      "In the selected DM, the sender must be you or the DM partner",
      "In the selected DM, the recipient must be you or the DM partner",
      "The sender and recipient must be different people",
    ],
  );
});
