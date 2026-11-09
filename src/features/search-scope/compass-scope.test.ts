import test from "node:test";
import assert from "node:assert/strict";
import {
  activeScopeSummary,
  compassFavorites,
  compassSearchPlaceholder,
  removableFilters,
  removeScopeFilter,
  scopeForChannel,
  searchScopeTitle,
} from "./compass-scope.ts";
import type { SearchScope } from "./model.ts";
const library = {
  version: 1 as const,
  teamId: "T1",
  userId: "U1",
  favoriteChannelIds: ["C2"],
  sections: [{ id: "s", name: "開発", channelIds: ["C1"] }],
};
const conversations = [
  { id: "C1", name: "one", type: "public" as const },
  { id: "C2", name: "two", type: "private" as const },
  { id: "C3", name: "group", type: "mpim" as const },
];
test("移行前のチャンネル印を別アカウントへ表示せず、人物とグループDMは残す", () => {
  assert.deepEqual(
    compassFavorites(["C1", "C3", "U2"], library, false, conversations),
    ["C3", "U2"],
  );
  assert.deepEqual(
    compassFavorites(["C1", "C3", "U2"], library, true, conversations),
    ["C3", "U2", "C2"],
  );
});
test("削除済みセクションはすべてという表示へ戻らない", () => {
  assert.equal(
    searchScopeTitle(
      { range: { kind: "section", sectionId: "missing" } },
      library,
      conversations,
      [],
    ),
    "Deleted Section",
  );
});

const people = [
  {
    id: "U1",
    handle: "me",
    displayName: "Hanako",
    realName: "Hanako",
    title: "",
    isBot: false,
  },
  {
    id: "U2",
    handle: "alice",
    displayName: "Alice",
    realName: "Alice A",
    title: "",
    isBot: false,
  },
  {
    id: "U3",
    handle: "bob",
    displayName: "",
    realName: "",
    title: "",
    isBot: false,
  },
];
const title = (scope: SearchScope, selfId?: string) =>
  searchScopeTitle(scope, library, conversations, people, selfId);

test("一覧の上の表題に、範囲・送信者・宛先・DM を出す", () => {
  assert.equal(title({ range: { kind: "all" } }), "All");
  assert.equal(
    title({
      range: { kind: "all" },
      senderId: "U2",
      recipient: { kind: "me" },
    }),
    "All / From: Alice / To: Me",
  );
  assert.equal(
    title({ range: { kind: "favorites" }, senderId: "U1" }, "U1"),
    "Favorite Channels / From: Me",
  );
  assert.equal(
    title({
      range: { kind: "channel", channelId: "C1" },
      recipient: { kind: "person", userId: "U3" },
    }),
    "#one / To: bob",
  );
  assert.equal(
    title({ range: { kind: "dm", userId: "U2" }, senderId: "U1" }, "U1"),
    "DM: Alice / From: Me",
  );
  assert.equal(title({ range: { kind: "dm", userId: "U1" } }, "U1"), "DM: Me");
});

test("一覧に無い人や削除された人は、表題でも汎用の名前で示す", () => {
  assert.equal(
    title({
      range: { kind: "dm", userId: "U9" },
      senderId: "U9",
      recipient: { kind: "person", userId: "U9" },
    }),
    "DM: Selected Person / From: Selected Sender / To: Selected Recipient",
  );
});

test("外せる条件は、指定中のものだけを範囲・送信者・宛先の順に返す", () => {
  assert.deepEqual(removableFilters({ range: { kind: "all" } }), []);
  assert.deepEqual(
    removableFilters({
      range: { kind: "dm", userId: "U2" },
      senderId: "U1",
      recipient: { kind: "me" },
    }),
    ["range", "sender", "recipient"],
  );
  assert.deepEqual(
    removableFilters({ range: { kind: "all" }, recipient: { kind: "me" } }),
    ["recipient"],
  );
});

test("条件を1つ外しても、ほかの条件は残る", () => {
  const scope: SearchScope = {
    range: { kind: "channel", channelId: "C1" },
    senderId: "U2",
    recipient: { kind: "me" },
  };
  assert.deepEqual(removeScopeFilter(scope, "range"), {
    range: { kind: "all" },
    senderId: "U2",
    recipient: { kind: "me" },
  });
  assert.deepEqual(removeScopeFilter(scope, "sender"), {
    range: { kind: "channel", channelId: "C1" },
    recipient: { kind: "me" },
  });
  assert.deepEqual(removeScopeFilter(scope, "recipient"), {
    range: { kind: "channel", channelId: "C1" },
    senderId: "U2",
  });
  // 元の条件は書き換えない
  assert.equal(scope.senderId, "U2");
  assert.deepEqual(removableFilters(removeScopeFilter(scope, "sender")), [
    "range",
    "recipient",
  ]);
});

test("チャンネルへ絞るとき、送信者と自分宛ては残し、人宛ては外す", () => {
  const channel = { kind: "channel", channelId: "C1" } as const;
  assert.deepEqual(
    scopeForChannel(
      {
        range: { kind: "dm", userId: "U2" },
        senderId: "U1",
        recipient: { kind: "me" },
      },
      "C1",
    ),
    { range: channel, senderId: "U1", recipient: { kind: "me" } },
  );
  assert.deepEqual(
    scopeForChannel(
      {
        range: { kind: "all" },
        senderId: "U1",
        recipient: { kind: "person", userId: "U2" },
      },
      "C1",
    ),
    { range: channel, senderId: "U1" },
  );
  assert.deepEqual(scopeForChannel({ range: { kind: "all" } }, "C1"), {
    range: channel,
  });
});

test("検索欄の例文は、既定の条件ならSearch Slack、条件を選んでいればその条件を足す", () => {
  const all: SearchScope = { range: { kind: "all" } };
  const fromMe: SearchScope = { range: { kind: "all" }, senderId: "U1" };
  assert.equal(activeScopeSummary(all, "All"), undefined);
  assert.equal(
    compassSearchPlaceholder(activeScopeSummary(all, "All")),
    "Search Slack",
  );
  assert.equal(
    compassSearchPlaceholder(activeScopeSummary(fromMe, "All / From: Me")),
    "Search Slack · All / From: Me",
  );
  assert.equal(
    activeScopeSummary({ range: { kind: "favorites" } }, "Favorite Channels"),
    "Favorite Channels",
  );
});
