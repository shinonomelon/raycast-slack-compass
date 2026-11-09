import assert from "node:assert/strict";
import { test } from "node:test";
import type { Row } from "../../slack/items.ts";
import { conversationGroups } from "./conversation-groups.ts";

test("チャンネル・ユーザー・グループDMへ分類し、各種別の順位・ID・名前・別名を保持する", () => {
  const row = (id: string, kind: Row["kind"]): Row => ({
    id,
    kind,
    title: `日本語 ${id}`,
    aliases: ["別名"],
    keywords: [id],
  });
  const rows = [
    row("U1", "person"),
    row("C2", "private"),
    row("G1", "group"),
    row("C1", "channel"),
    row("U2", "person"),
  ];
  const groups = conversationGroups(rows);
  assert.deepEqual(
    groups.map((group) => group.title),
    ["Channels", "People", "Group DMs"],
  );
  assert.deepEqual(
    groups.map((group) => group.rows.map((row) => row.id)),
    [["C2", "C1"], ["U1", "U2"], ["G1"]],
  );
  assert.equal(groups[0].rows[0], rows[1]);
  assert.deepEqual(conversationGroups([]), []);
  assert.deepEqual(
    conversationGroups([rows[0]]).map((group) => group.id),
    ["people"],
  );
});
