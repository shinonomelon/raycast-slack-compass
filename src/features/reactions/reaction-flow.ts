// 画面（reaction-screens.tsx）が書き込みの前後で下す判断を、純粋な関数にしたもの。
// @raycast/api も React も読み込まないので、node のテストから動かせる。
// 判断は「書き込んでよいか」と「結果ごとに、トースト・画面を閉じるか・次の書き込みを許すか」の2つ。
import type { ReactionAction, ReactionOutcome } from "./reactions.ts";

// 書き込める状態か。二度押し（running）・未確認のあと（unconfirmed）・認証前（canFetch なし）は書き込まない
export function canStartChange(state: {
  running: boolean;
  unconfirmed: boolean;
  canFetch: boolean;
}): boolean {
  return state.canFetch && !state.running && !state.unconfirmed;
}

// 書き込みを始めたときのトースト
export function pendingToast(action: ReactionAction, name: string) {
  return {
    title: action === "add" ? "Adding reaction" : "Removing reaction",
    message: `:${name}:`,
  };
}

export type ChangePlan = {
  toast: {
    style: "success" | "failure";
    title: string;
    message: string;
    // トーストに「Slack で開く」を付ける（未確認のとき、確かめに行けるように）
    offerOpen: boolean;
  };
  // 選択画面を閉じて元の画面に戻る。成功したときだけで、しかも画面がまだ開いているときだけ
  // （閉じたあとに pop すると、元の画面まで巻き込んで戻ってしまう）
  pop: boolean;
  // 以後、この画面では書き込めなくする（未確認のあと）
  markUnconfirmed: boolean;
  // running を戻して、次の書き込みを許す。失敗（何も変わっていない）のときだけ。
  // 成功は画面を閉じるので、未確認は二重に書き込まないために、戻さない
  releaseRunning: boolean;
  // 読み込み中の表示を止める。成功は画面を閉じるので止めない
  stopSpinner: boolean;
};

// 書き込みの結果から、画面が次にすることを決める
export function planAfterChange(
  outcome: ReactionOutcome,
  action: ReactionAction,
  name: string,
  screenOpen: boolean,
): ChangePlan {
  if (outcome.kind === "done") {
    return {
      toast: {
        style: "success",
        title: outcome.already
          ? "Nothing to change"
          : action === "add"
            ? "Reaction added"
            : "Reaction removed",
        message: outcome.already ? outcome.message : `:${name}:`,
        offerOpen: false,
      },
      pop: screenOpen,
      markUnconfirmed: false,
      releaseRunning: false,
      stopSpinner: false,
    };
  }
  if (outcome.kind === "unconfirmed") {
    return {
      toast: {
        style: "failure",
        title: "Reaction status not confirmed",
        message: outcome.message,
        offerOpen: true,
      },
      pop: false,
      markUnconfirmed: true,
      releaseRunning: false,
      stopSpinner: true,
    };
  }
  return {
    toast: {
      style: "failure",
      title:
        action === "add"
          ? "Could not add reaction"
          : "Could not remove reaction",
      message: outcome.message,
      offerOpen: false,
    },
    pop: false,
    markUnconfirmed: false,
    releaseRunning: true,
    stopSpinner: true,
  };
}
