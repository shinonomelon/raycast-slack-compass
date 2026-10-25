import assert from "node:assert/strict";
import { test } from "node:test";
import { emojiQueryTerms, searchEmoji, STANDARD_EMOJI } from "./emoji.ts";
import { SLACK_EMOJI_UNICODE } from "./emoji-table.fixtures.ts";
import { validReactionName } from "./reactions.ts";

const names = (query: string) => searchEmoji(query).map((emoji) => emoji.name);

test("一覧の絵文字名は重ならず、どれも reactions.add に渡せる形で、見た目の絵文字を持つ", () => {
  const seen = new Set<string>();
  for (const emoji of STANDARD_EMOJI) {
    assert.equal(seen.has(emoji.name), false, `${emoji.name} が重なる`);
    seen.add(emoji.name);
    assert.ok(validReactionName(emoji.name), emoji.name);
    assert.ok(emoji.char.length > 0, emoji.name);
    for (const keyword of emoji.keywords)
      assert.equal(keyword, keyword.toLowerCase(), `${emoji.name}:${keyword}`);
  }
  assert.ok(STANDARD_EMOJI.length >= 200);
});

test("検索欄の語は小文字にし、コロンと空白で分ける", () => {
  assert.deepEqual(emojiQueryTerms(" :Thumbs_Up:  Like "), [
    "thumbs_up",
    "like",
  ]);
  assert.deepEqual(emojiQueryTerms(""), []);
  assert.deepEqual(emojiQueryTerms("::"), []);
});

// 絵文字を Unicode のコードポイント（小文字16進をハイフンでつなぐ）にする。異体字選択子（fe0f・fe0e）は見た目を変えないので除く
const codepoints = (text: string) =>
  [...text]
    .map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0"))
    .filter((c) => c !== "fe0f" && c !== "fe0e")
    .join("-");
const slackCodepoints = (unicode: string) =>
  unicode
    .split("-")
    .filter((c) => c !== "fe0f" && c !== "fe0e")
    .join("-");

test("一覧の定義で、同じ見た目の絵文字が2つの名前に載っていない（別名は keywords に持つ）", () => {
  const owners = new Map<string, string>();
  for (const emoji of STANDARD_EMOJI) {
    const key = codepoints(emoji.char);
    assert.equal(
      owners.get(key),
      undefined,
      `${emoji.name} が ${owners.get(key)} と同じ見た目`,
    );
    owners.set(key, emoji.name);
  }
});

test("名前と見た目が、Slack の絵文字の対応表（固定の表）と一致する", () => {
  const table = SLACK_EMOJI_UNICODE;
  // 照合した件数が0にならないよう、件数を固定する
  assert.equal(Object.keys(table).length, STANDARD_EMOJI.length);
  for (const emoji of STANDARD_EMOJI) {
    const unicode = table[emoji.name];
    assert.ok(unicode, `${emoji.name} は Slack の対応表に無い名前`);
    assert.equal(
      codepoints(emoji.char),
      slackCodepoints(unicode),
      `${emoji.name} の見た目が Slack の実体と違う`,
    );
  }
  // 固定の表にだけ残った名前（一覧から外したのに表に残った）が無い
  const names = new Set(STANDARD_EMOJI.map((emoji) => emoji.name));
  for (const name of Object.keys(table))
    assert.ok(names.has(name), `${name} は表にだけある`);
});

test("Slack に無かった名前・見た目が違った名前は、一覧に載せていない", () => {
  const names = new Set(STANDARD_EMOJI.map((emoji) => emoji.name));
  for (const wrong of [
    "metal",
    "stop_sign",
    "cloud_with_lightning",
    "beetle",
    "medal",
    "moon",
    "satellite",
    "snowman",
    "+1",
    "-1",
  ])
    assert.equal(names.has(wrong), false, wrong);
  for (const right of [
    "the_horns",
    "octagonal_sign",
    "lightning",
    "ladybug",
    "sports_medal",
    "crescent_moon",
    "satellite_antenna",
    "snowman_without_snow",
  ])
    assert.ok(names.has(right), right);
});

test("空欄は一覧の順のまま全件。先頭は thumbsup", () => {
  const all = searchEmoji("");
  assert.equal(all.length, STANDARD_EMOJI.length);
  assert.equal(all[0].name, "thumbsup");
  assert.deepEqual(
    all.map((emoji) => emoji.name),
    STANDARD_EMOJI.map((emoji) => emoji.name),
  );
});

test("名前の完全一致が先頭で、コロンつきでも同じ", () => {
  assert.equal(names("eyes")[0], "eyes");
  assert.equal(names(":eyes:")[0], "eyes");
  assert.equal(names("EYES")[0], "eyes");
});

test("名前の前方一致は、名前に含むだけのものより先に出る", () => {
  const result = names("eye");
  assert.equal(result[0], "eyes");
  assert.ok(result.includes("heart_eyes"));
  assert.ok(result.indexOf("eyes") < result.indexOf("heart_eyes"));
});

test("Slack の別名や旧い呼び名でも探せる（+1・-1・metal・stop sign・beetle・medal）", () => {
  assert.equal(names("+1")[0], "thumbsup");
  assert.equal(names("-1")[0], "thumbsdown");
  assert.equal(names("metal")[0], "the_horns");
  assert.equal(names("stop sign")[0], "octagonal_sign");
  assert.ok(names("beetle").includes("ladybug"));
  assert.ok(names("medal").includes("sports_medal"));
  assert.ok(names("snowman").includes("snowman_without_snow"));
});

test("英語の言葉でも探せる。語を複数打てばすべてに合うものだけ", () => {
  assert.ok(names("thanks").includes("pray"));
  assert.equal(names("congrats")[0], "tada");
  assert.ok(names("check mark").includes("white_check_mark"));
  assert.equal(names("check mark").includes("eyes"), false);
  assert.ok(names("check").includes("heavy_check_mark"));
});

test("合うものが無ければ空。日本語など一覧に無い語も空", () => {
  assert.deepEqual(names("zzzzqqq"), []);
  assert.deepEqual(names("確認"), []);
});
