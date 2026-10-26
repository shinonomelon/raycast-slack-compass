import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  classifyReactionError,
  describeApiFailure,
  changeReaction,
  fetchMyReactions,
  mineNotices,
  myReactionNames,
  PERMISSION_MESSAGE,
  REACTION_TIMEOUT_MS,
  validChannelId,
  validMessageTs,
  validReactionName,
} from "./reactions.ts";
import {
  createSlackApi,
  SlackApiError,
  type ApiCall,
  type ApiMethod,
  type ApiOptions,
  type ApiParams,
} from "../../slack/slack-api.ts";

const TS = "1759560123.456789";
const target = { channelId: "C1", ts: TS };
const SELF = "U1";

function fake(respond: ApiCall) {
  const calls: {
    method: ApiMethod;
    params?: ApiParams;
    options?: ApiOptions;
  }[] = [];
  const api: ApiCall = async (method, params, options) => {
    calls.push({ method, params, options });
    return respond(method, params, options);
  };
  return { calls, api };
}
const rejecting = (error: unknown) =>
  fake(async () => {
    throw error;
  });
const apiError = (code: string) =>
  new SlackApiError("api", `Slack API: ${code}`, undefined, code);

test("対象と絵文字名の形を検証する", () => {
  assert.ok(validChannelId("C0123ABC"));
  assert.ok(validChannelId("D1"));
  assert.ok(validChannelId("G1"));
  for (const bad of ["c1", "U1", "", "C 1", "C1\n", undefined, 1])
    assert.equal(validChannelId(bad), false, String(bad));
  assert.ok(validMessageTs(TS));
  for (const bad of [
    "1.0",
    "1759560123",
    "1759560123.45678",
    " 1759560123.456789",
    "abc",
  ])
    assert.equal(validMessageTs(bad), false, bad);
  for (const good of [
    "eyes",
    "+1",
    "-1",
    "white_check_mark",
    "star-struck",
    "thumbsup::skin-tone-3",
  ])
    assert.ok(validReactionName(good), good);
  for (const bad of [
    "",
    ":eyes:",
    "a b",
    "eyes\n",
    "x::skin-tone-9",
    "日本語",
    "a".repeat(101),
  ])
    assert.equal(validReactionName(bad), false, bad);
});

test("追加は reactions.add を1回だけ、dedupe なし・中断なし・操作元 reaction で呼ぶ", async () => {
  const { calls, api } = fake(async () => ({ ok: true }));
  const outcome = await changeReaction(api, target, "eyes", "add");
  assert.deepEqual(outcome, {
    kind: "done",
    already: false,
    message: "Added :eyes:",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "reactions.add");
  assert.deepEqual(calls[0].params, {
    channel: "C1",
    timestamp: TS,
    name: "eyes",
  });
  assert.equal(calls[0].options?.source, "reaction");
  assert.equal(calls[0].options?.dedupe, false);
  assert.equal(calls[0].options?.signal, undefined);
  // 送る前に使った時間を引いた残りを渡す（0 より大きく、全体の上限以下）
  assert.ok((calls[0].options?.timeoutMs ?? 0) > 0);
  assert.ok((calls[0].options?.timeoutMs ?? 0) <= REACTION_TIMEOUT_MS);
  assert.ok((calls[0].options?.deadlineAt ?? 0) > 0);
});

test("除去は reactions.remove を1回だけ呼ぶ", async () => {
  const { calls, api } = fake(async () => ({ ok: true }));
  const outcome = await changeReaction(
    api,
    target,
    "thumbsup::skin-tone-2",
    "remove",
  );
  assert.deepEqual(outcome, {
    kind: "done",
    already: false,
    message: "Removed :thumbsup::skin-tone-2:",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "reactions.remove");
  assert.equal(calls[0].options?.dedupe, false);
});

test("対象・絵文字名が不正なら、送らずに失敗を返す", async () => {
  const bad = [
    [{ channelId: "c1", ts: TS }, "eyes"],
    [{ channelId: "C1", ts: "123" }, "eyes"],
    [{ channelId: "C1", ts: TS }, ":eyes:"],
    [{ channelId: "C1", ts: TS }, ""],
    [{ channelId: "C1", ts: TS }, "a b"],
  ] as const;
  for (const action of ["add", "remove"] as const)
    for (const [t, name] of bad) {
      const { calls, api } = fake(async () => ({ ok: true }));
      const outcome = await changeReaction(api, t, name, action);
      assert.equal(outcome.kind, "failed");
      assert.equal(
        outcome.kind === "failed" && outcome.reason,
        "invalid_input",
      );
      assert.equal(calls.length, 0);
    }
});

test("すでに追加済み（already_reacted）・すでに除去済み（no_reaction）は成功扱いで、その旨を伝える", async () => {
  const added = await changeReaction(
    rejecting(apiError("already_reacted")).api,
    target,
    "eyes",
    "add",
  );
  assert.deepEqual(added, {
    kind: "done",
    already: true,
    message: "You already reacted with :eyes:. Nothing to change",
  });
  const removed = await changeReaction(
    rejecting(apiError("no_reaction")).api,
    target,
    "eyes",
    "remove",
  );
  assert.deepEqual(removed, {
    kind: "done",
    already: true,
    message: ":eyes: was already removed. Nothing to change",
  });
});

test("already_reacted は除去では、no_reaction は追加では成功扱いにしない", async () => {
  const remove = await changeReaction(
    rejecting(apiError("already_reacted")).api,
    target,
    "eyes",
    "remove",
  );
  assert.equal(remove.kind, "failed");
  const add = await changeReaction(
    rejecting(apiError("no_reaction")).api,
    target,
    "eyes",
    "add",
  );
  assert.equal(add.kind, "failed");
});

test("権限不足は reactions:read・reactions:write を足して入れ直すよう案内する", async () => {
  for (const code of ["missing_scope", "not_allowed_token_type"])
    for (const action of ["add", "remove"] as const) {
      const outcome = await changeReaction(
        rejecting(apiError(code)).api,
        target,
        "eyes",
        action,
      );
      assert.equal(outcome.kind, "failed");
      if (outcome.kind !== "failed") return;
      assert.equal(outcome.reason, "permission");
      assert.equal(outcome.message, PERMISSION_MESSAGE);
      assert.match(outcome.message, /reactions:read/);
      assert.match(outcome.message, /reactions:write/);
      assert.match(outcome.message, /reinstall/);
    }
});

test("認証・削除や見えない投稿・反応できない投稿・絵文字名・上限・その他を区別して案内する", async () => {
  const cases: [string, string, RegExp][] = [
    ["invalid_auth", "auth", /Slack Access Token/],
    ["token_revoked", "auth", /Slack Access Token/],
    ["message_not_found", "gone", /deleted, or you cannot see it/],
    ["channel_not_found", "gone", /deleted, or you cannot see it/],
    ["not_reactable", "not_allowed", /does not allow reactions/],
    ["is_archived", "not_allowed", /does not allow reactions/],
    ["invalid_name", "invalid_name", /does not recognize the emoji :eyes:/],
    ["too_many_emoji", "limit", /maximum number of reactions/],
    ["too_many_reactions", "limit", /maximum number of reactions/],
    ["something_new", "rejected", /rejected the request \(something_new\)/],
  ];
  for (const [code, reason, pattern] of cases) {
    const outcome = await changeReaction(
      rejecting(apiError(code)).api,
      target,
      "eyes",
      "add",
    );
    assert.equal(outcome.kind, "failed", code);
    if (outcome.kind !== "failed") return;
    assert.equal(outcome.reason, reason, code);
    assert.match(outcome.message, pattern, code);
    // 権限不足・認証の案内は、設定を直す手順が主で、「何も変わっていない」は添えない
    if (reason !== "auth")
      assert.match(outcome.message, /Nothing was changed/, code);
  }
});

test("回数制限・送信待機・設定の誤りは、送らなかった失敗として1回で返し、再送しない", async () => {
  const cases: [SlackApiError, string][] = [
    [
      new SlackApiError(
        "rate_limited",
        "Slack API rate limit. Retry in 7 seconds",
        7,
        "ratelimited",
      ),
      "rate_limited",
    ],
    [new SlackApiError("deferred", "waiting", 0), "deferred"],
    [
      new SlackApiError(
        "configuration",
        "Set a User OAuth Token (xoxp-) in Slack Access Token",
      ),
      "configuration",
    ],
  ];
  for (const [error, reason] of cases) {
    const { calls, api } = rejecting(error);
    const outcome = await changeReaction(api, target, "eyes", "add");
    assert.equal(outcome.kind, "failed");
    assert.equal(outcome.kind === "failed" && outcome.reason, reason);
    assert.equal(calls.length, 1);
  }
  const limited = await changeReaction(
    rejecting(cases[0][0]).api,
    target,
    "eyes",
    "add",
  );
  assert.match(
    limited.kind === "failed" ? limited.message : "",
    /Retry in 7 seconds/,
  );
});

test("時間切れ・通信エラー・HTTPエラー・読めない応答・Slack側の不調は未確認で、再送しない", async () => {
  const errors: unknown[] = [
    new SlackApiError(
      "timeout",
      "Slack API request timed out after 30 seconds",
    ),
    new SlackApiError("network", "Could not connect to the Slack API"),
    new SlackApiError("http", "Slack API HTTP error (502)"),
    new SlackApiError("unreadable", "Could not read the Slack API response"),
    new SlackApiError("aborted", "Request canceled"),
    apiError("internal_error"),
    apiError("service_unavailable"),
    apiError("fatal_error"),
    apiError("request_timeout"),
    new TypeError("fetch failed"),
  ];
  for (const action of ["add", "remove"] as const)
    for (const error of errors) {
      const { calls, api } = rejecting(error);
      const outcome = await changeReaction(api, target, "eyes", action);
      assert.equal(outcome.kind, "unconfirmed", String(error));
      if (outcome.kind !== "unconfirmed") return;
      assert.match(outcome.message, /may or may not have been/);
      assert.match(outcome.message, /Check the message in Slack/);
      assert.equal(calls.length, 1);
    }
});

test("未確認の案内文にトークンを含めない", () => {
  const outcome = classifyReactionError(
    new SlackApiError("network", "failed with xoxp-1234-secret-token"),
    "add",
    "eyes",
  );
  assert.equal(outcome.kind, "unconfirmed");
  assert.doesNotMatch(JSON.stringify(outcome), /xoxp-1234/);
});

test("本物の通信層でも分類できる：権限不足は失敗、通信エラーは未確認で、どちらも1回しか送らない", async () => {
  let sent = 0;
  const scope = createSlackApi("xoxp-test-token", async () => {
    sent++;
    return new Response(
      JSON.stringify({
        ok: false,
        error: "missing_scope",
        needed: "reactions:write",
      }),
    );
  });
  const denied = await changeReaction(scope, target, "eyes", "add");
  assert.equal(denied.kind === "failed" && denied.reason, "permission");
  assert.equal(sent, 1);

  let attempts = 0;
  const broken = createSlackApi("xoxp-test-token", async () => {
    attempts++;
    throw new TypeError("fetch failed");
  });
  const lost = await changeReaction(broken, target, "eyes", "remove");
  assert.equal(lost.kind, "unconfirmed");
  assert.equal(attempts, 1);

  let already = 0;
  const duplicated = createSlackApi("xoxp-test-token", async (_input, init) => {
    already++;
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({ ok: false, error: "already_reacted" }),
    );
  });
  const outcome = await changeReaction(duplicated, target, "eyes", "add");
  assert.equal(outcome.kind === "done" && outcome.already, true);
  assert.equal(already, 1);
});

test("describeApiFailure は反映の可否が分からないものを undefined にする", () => {
  assert.equal(
    describeApiFailure(new SlackApiError("timeout", "t"), "add"),
    undefined,
  );
  assert.equal(describeApiFailure(new Error("x"), "add"), undefined);
  assert.equal(
    describeApiFailure(apiError("internal_error"), "remove"),
    undefined,
  );
});

// ---- 自分のリアクションの抽出 -------------------------------------------------------
const reply = (reactions: unknown, extra: Record<string, unknown> = {}) => ({
  ok: true,
  type: "message",
  channel: "C1",
  message: { type: "message", ts: TS, reactions },
  ...extra,
});

const mineOf = (data: Record<string, unknown>, selfId = SELF) =>
  myReactionNames(data, target, selfId);

test("自分が付けたリアクションだけを抜き出す", () => {
  const data = reply([
    { name: "eyes", count: 2, users: ["U2", SELF] },
    { name: "tada", count: 1, users: ["U2"] },
    { name: "+1", count: 1, users: [SELF] },
  ]);
  assert.deepEqual(mineOf(data), {
    names: ["eyes", "+1"],
    unremovable: 0,
    incomplete: false,
  });
  assert.deepEqual(mineOf(data, "U9").names, []);
});

test("リアクションが無い投稿は空で、案内も出ない", () => {
  for (const data of [reply(undefined), reply([])]) {
    const mine = mineOf(data);
    assert.deepEqual(mine, { names: [], unremovable: 0, incomplete: false });
    assert.deepEqual(mineNotices(mine), []);
  }
});

test("同じ名前が2回あっても1件にまとめる", () => {
  assert.deepEqual(
    mineOf(
      reply([
        { name: "eyes", users: [SELF] },
        { name: "eyes", users: [SELF] },
      ]),
    ),
    { names: ["eyes"], unremovable: 0, incomplete: false },
  );
});

test("自分のリアクションで名前の形が合わないものは、黙って捨てず件数を返し、Slack で外すよう案内する", () => {
  const mine = mineOf(
    reply([
      { name: "bad name", count: 1, users: [SELF] },
      { name: "also:bad", count: 2, users: ["U2", SELF] },
      { name: "eyes", count: 1, users: [SELF] },
      // 他の人のものは、形が合わなくても数えない
      { name: "other bad", count: 1, users: ["U2"] },
    ]),
  );
  assert.deepEqual(mine, {
    names: ["eyes"],
    unremovable: 2,
    incomplete: false,
  });
  assert.deepEqual(mineNotices(mine), [
    "2 reactions of yours have names Slack Compass cannot remove. Remove them in Slack",
  ]);
  assert.deepEqual(
    mineNotices({ names: [], unremovable: 1, incomplete: false }),
    [
      "1 reaction of yours has a name Slack Compass cannot remove. Remove it in Slack",
    ],
  );
});

test("自分が見つからず count が users より多いリアクションがあれば、一覧が不完全かもしれないと案内する", () => {
  const mine = mineOf(
    reply([
      // users が切れている：count は5なのに users は2人分
      { name: "tada", count: 5, users: ["U2", "U3"] },
      { name: "eyes", count: 1, users: [SELF] },
    ]),
  );
  assert.deepEqual(mine, { names: ["eyes"], unremovable: 0, incomplete: true });
  assert.deepEqual(mineNotices(mine), [
    "This list may be incomplete: Slack did not return every user for some reactions. Check the message in Slack",
  ]);
});

test("不完全と判断するのは、自分が見つからず count が users を上回るときだけ", () => {
  // 自分が見つかったリアクションは、users が切れていても不完全にしない
  assert.equal(
    mineOf(reply([{ name: "eyes", count: 9, users: [SELF] }])).incomplete,
    false,
  );
  // count が users と同じ・少ない・無いなら不完全にしない
  for (const count of [2, 1, undefined])
    assert.equal(
      mineOf(reply([{ name: "tada", count, users: ["U2", "U3"] }])).incomplete,
      false,
      String(count),
    );
  // count が数でないときも不完全にしない（読み取りエラーにもしない）
  assert.equal(
    mineOf(reply([{ name: "tada", count: "5", users: ["U2"] }])).incomplete,
    false,
  );
});

test("外せない名前と不完全の案内は両方出る", () => {
  assert.equal(
    mineNotices({ names: ["eyes"], unremovable: 3, incomplete: true }).length,
    2,
  );
});

test("応答が壊れている・別の投稿のものなら読み取りエラー", () => {
  const unreadable = (data: Record<string, unknown>) =>
    assert.throws(
      () => myReactionNames(data, target, SELF),
      (error: unknown) =>
        error instanceof SlackApiError && error.kind === "unreadable",
    );
  unreadable({});
  unreadable({ ok: false });
  unreadable({ ok: true });
  unreadable(reply("eyes"));
  unreadable(reply([{ name: "eyes", users: "U1" }]));
  unreadable(reply([{ name: "eyes", users: [1] }]));
  unreadable(reply([{ users: [SELF] }]));
  unreadable(reply([null]));
  unreadable(reply([], { channel: "C2" }));
  unreadable({
    ok: true,
    channel: "C1",
    message: { ts: "1759560999.000001", reactions: [] },
  });
});

test("自分のリアクションの取得は reactions.get を full 付きで呼び、結果を返す", async () => {
  const { calls, api } = fake(async () =>
    reply([{ name: "eyes", users: [SELF] }]),
  );
  const abort = new AbortController();
  const result = await fetchMyReactions(api, target, SELF, abort.signal);
  assert.deepEqual(result, {
    kind: "ready",
    names: ["eyes"],
    unremovable: 0,
    incomplete: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "reactions.get");
  assert.deepEqual(calls[0].params, {
    channel: "C1",
    timestamp: TS,
    full: true,
  });
  assert.equal(calls[0].options?.source, "reaction");
  assert.equal(calls[0].options?.signal, abort.signal);
});

test("自分のリアクションの取得の失敗は、案内する文にする。不正な対象は呼ばない", async () => {
  const denied = await fetchMyReactions(
    rejecting(apiError("missing_scope")).api,
    target,
    SELF,
  );
  assert.deepEqual(denied, { kind: "failed", message: PERMISSION_MESSAGE });
  const gone = await fetchMyReactions(
    rejecting(apiError("message_not_found")).api,
    target,
    SELF,
  );
  assert.equal(
    gone.kind === "failed" &&
      /deleted, or you cannot see it/.test(gone.message),
    true,
  );
  const lost = await fetchMyReactions(
    rejecting(new SlackApiError("timeout", "t")).api,
    target,
    SELF,
  );
  assert.equal(
    lost.kind === "failed" &&
      /Could not load your reactions/.test(lost.message),
    true,
  );
  const garbage = await fetchMyReactions(
    fake(async () => ({ ok: true })).api,
    target,
    SELF,
  );
  assert.equal(garbage.kind, "failed");
  const invalid = fake(async () => ({ ok: true }));
  const none = await fetchMyReactions(
    invalid.api,
    { channelId: "x", ts: TS },
    SELF,
  );
  assert.equal(none.kind, "failed");
  assert.equal(invalid.calls.length, 0);
});

// ---- 印への副作用が無いこと ----------------------------------------------------------
test("リアクションの部品は、対応済み・開いた の印（triage）を読み込まず、印の関数を使わない", () => {
  const dir = "src/features/reactions";
  const files = readdirSync(dir).filter(
    (file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"),
  );
  assert.ok(files.length >= 3);
  for (const file of files) {
    const code = readFileSync(`${dir}/${file}`, "utf8");
    for (const line of code.split("\n").filter((l) => /\bfrom\s+"/.test(l)))
      assert.doesNotMatch(
        line,
        /triage|read-state|prefs-store/,
        `${file}: ${line}`,
      );
    assert.doesNotMatch(
      code,
      /markOpened|markReplied|toggleHandled|\bonOpen\b|\bonReplied\b|\bonToggleHandled\b/,
      file,
    );
  }
});
