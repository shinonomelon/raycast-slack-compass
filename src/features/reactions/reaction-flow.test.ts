import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canStartChange,
  pendingToast,
  planAfterChange,
} from "./reaction-flow.ts";
import type { ReactionOutcome } from "./reactions.ts";

const done: ReactionOutcome = {
  kind: "done",
  already: false,
  message: "Added :eyes:",
};
const already: ReactionOutcome = {
  kind: "done",
  already: true,
  message: "You already reacted with :eyes:. Nothing to change",
};
const unconfirmed: ReactionOutcome = {
  kind: "unconfirmed",
  message:
    "timed out. The reaction may or may not have been added. Check the message in Slack before trying again",
};
const failed: ReactionOutcome = {
  kind: "failed",
  reason: "permission",
  message: "not allowed",
};

test("書き込めるのは、認証済みで、書き込み中でも未確認のあとでもないときだけ", () => {
  assert.equal(
    canStartChange({ running: false, unconfirmed: false, canFetch: true }),
    true,
  );
  assert.equal(
    canStartChange({ running: true, unconfirmed: false, canFetch: true }),
    false,
  );
  assert.equal(
    canStartChange({ running: false, unconfirmed: true, canFetch: true }),
    false,
  );
  assert.equal(
    canStartChange({ running: false, unconfirmed: false, canFetch: false }),
    false,
  );
});

test("書き込みを始めるトーストは、追加と除去で文言が違い、絵文字名を添える", () => {
  assert.deepEqual(pendingToast("add", "eyes"), {
    title: "Adding reaction",
    message: ":eyes:",
  });
  assert.deepEqual(pendingToast("remove", "eyes"), {
    title: "Removing reaction",
    message: ":eyes:",
  });
});

test("成功したときだけ、画面が開いていれば元の画面へ戻る", () => {
  for (const outcome of [done, already]) {
    const open = planAfterChange(outcome, "add", "eyes", true);
    assert.equal(open.pop, true);
    assert.equal(open.toast.style, "success");
    // 画面を先に閉じていたら、元の画面を巻き込んで戻らない
    assert.equal(planAfterChange(outcome, "add", "eyes", false).pop, false);
  }
  for (const outcome of [unconfirmed, failed])
    for (const screenOpen of [true, false])
      assert.equal(
        planAfterChange(outcome, "add", "eyes", screenOpen).pop,
        false,
      );
});

test("成功のトースト：追加・除去・すでにそうなっていた場合", () => {
  assert.deepEqual(planAfterChange(done, "add", "eyes", true).toast, {
    style: "success",
    title: "Reaction added",
    message: ":eyes:",
    offerOpen: false,
  });
  assert.equal(
    planAfterChange(done, "remove", "eyes", true).toast.title,
    "Reaction removed",
  );
  const same = planAfterChange(already, "add", "eyes", true).toast;
  assert.equal(same.title, "Nothing to change");
  assert.equal(same.message, already.kind === "done" ? already.message : "");
});

test("失敗：何も変わっていないので書き込みを許し、理由を添えたトーストを出す", () => {
  const plan = planAfterChange(failed, "remove", "eyes", true);
  assert.equal(plan.releaseRunning, true);
  assert.equal(plan.markUnconfirmed, false);
  assert.equal(plan.stopSpinner, true);
  assert.deepEqual(plan.toast, {
    style: "failure",
    title: "Could not remove reaction",
    message: "not allowed",
    offerOpen: false,
  });
  assert.equal(
    planAfterChange(failed, "add", "eyes", true).toast.title,
    "Could not add reaction",
  );
});

test("未確認：書き込みを止めたまま戻さず、Slack で確かめる操作をトーストに付ける", () => {
  const plan = planAfterChange(unconfirmed, "add", "eyes", true);
  assert.equal(plan.markUnconfirmed, true);
  assert.equal(plan.releaseRunning, false);
  assert.equal(plan.stopSpinner, true);
  assert.equal(plan.toast.offerOpen, true);
  assert.equal(plan.toast.title, "Reaction status not confirmed");
  assert.match(plan.toast.message, /Check the message in Slack/);
});

test("成功は画面を閉じるので、書き込みを許さない・読み込み表示も止めない", () => {
  const plan = planAfterChange(done, "add", "eyes", true);
  assert.equal(plan.releaseRunning, false);
  assert.equal(plan.stopSpinner, false);
  assert.equal(plan.markUnconfirmed, false);
});

// 画面の状態（running・unconfirmed）を、判断の関数だけで進める
function screen() {
  const state = { running: false, unconfirmed: false };
  const writes: string[] = [];
  return {
    state,
    writes,
    // 絵文字を選ぶ。始められなければ false。始めたら書き込みを数え、結果を反映するまで running のまま
    press(name: string) {
      if (!canStartChange({ ...state, canFetch: true })) return false;
      state.running = true;
      writes.push(name);
      return true;
    },
    finish(outcome: ReactionOutcome, name: string, screenOpen = true) {
      const plan = planAfterChange(outcome, "add", name, screenOpen);
      if (plan.markUnconfirmed) state.unconfirmed = true;
      if (plan.releaseRunning) state.running = false;
      return plan;
    },
  };
}

test("二度押しは、結果が出るまで2回目を書き込まない", () => {
  const s = screen();
  assert.equal(s.press("eyes"), true);
  assert.equal(s.press("eyes"), false);
  assert.equal(s.press("tada"), false);
  assert.deepEqual(s.writes, ["eyes"]);
});

test("失敗のあとは書き込み直せる", () => {
  const s = screen();
  s.press("eyes");
  s.finish(failed, "eyes");
  assert.equal(s.press("tada"), true);
  assert.deepEqual(s.writes, ["eyes", "tada"]);
});

test("未確認のあとは、何度押しても書き込まない（自動でも手動でも再送しない）", () => {
  const s = screen();
  s.press("eyes");
  s.finish(unconfirmed, "eyes");
  assert.equal(s.state.unconfirmed, true);
  assert.equal(s.state.running, true);
  for (let i = 0; i < 3; i++) assert.equal(s.press("eyes"), false);
  assert.deepEqual(s.writes, ["eyes"]);
});

test("成功のあとも、画面が閉じるまでは書き込まない", () => {
  const s = screen();
  s.press("eyes");
  assert.equal(s.finish(done, "eyes").pop, true);
  assert.equal(s.press("tada"), false);
  assert.deepEqual(s.writes, ["eyes"]);
});
