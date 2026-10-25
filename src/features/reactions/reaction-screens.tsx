import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { messageLink, type Hit } from "../../slack/hits.ts";
import type { Session } from "../../slack/identity.ts";
import { searchEmoji, STANDARD_EMOJI } from "./emoji.ts";
import {
  canStartChange,
  pendingToast,
  planAfterChange,
} from "./reaction-flow.ts";
import {
  changeReaction,
  fetchMyReactions,
  mineNotices,
  reactionTargetOf,
  type MyReactions,
  type ReactionAction,
} from "./reactions.ts";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// 絵文字の見た目つきの表示名。一覧に無い名前（ワークスペース独自の絵文字など）は :名前: だけ
const emojiTitle = (name: string) => {
  const found = STANDARD_EMOJI.find((emoji) => emoji.name === name);
  return found ? `${found.char}  :${name}:` : `:${name}:`;
};

// 追加・除去の書き込みを1回だけ行い、結果をトーストで伝える。
// - 成功（すでにそうなっていた場合を含む）：トーストを出し、この画面を閉じて元の画面に戻る
// - 失敗：画面に残し、理由を英語で案内する
// - 反映されたか分からない：自動で再送せず、この画面では書き込めなくする。Slack で確かめてもらう
// 対応済み・開いた の印（triage）は、ここでは付けも外しもしない（呼び出し側から印の関数を受け取らない）
function useReactionChange(session: Session, hit: Hit, action: ReactionAction) {
  const { pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  // 二度押しを止める。state は次の描画まで変わらないので ref で持つ
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const link = messageLink(session.display.teamId, hit);

  async function run(name: string) {
    if (
      !canStartChange({
        running: running.current,
        unconfirmed,
        canFetch: session.canFetch,
      })
    )
      return;
    running.current = true;
    setBusy(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      ...pendingToast(action, name),
    });
    // signal は渡さない。画面を閉じても書き込みは最後まで行い、結果はこのトーストで出す
    const outcome = await changeReaction(
      session.api,
      reactionTargetOf(hit),
      name,
      action,
    );
    // 結果ごとの判断（閉じるか・書き込めなくするか・running を戻すか）は planAfterChange に任せる
    const plan = planAfterChange(outcome, action, name, mounted.current);
    toast.style =
      plan.toast.style === "success"
        ? Toast.Style.Success
        : Toast.Style.Failure;
    toast.title = plan.toast.title;
    toast.message = plan.toast.message;
    if (plan.toast.offerOpen)
      toast.primaryAction = {
        title: "Open in Slack",
        onAction: async () => {
          try {
            await open(link);
          } catch (error) {
            toast.message = `Could not open Slack (${errorMessage(error)})`;
          }
        },
      };
    if (plan.markUnconfirmed) setUnconfirmed(true);
    if (plan.releaseRunning) running.current = false;
    if (plan.stopSpinner && mounted.current) setBusy(false);
    if (plan.pop) pop();
  }
  return { run, busy, unconfirmed, link };
}

function OpenInSlack({ link }: { link: string }) {
  return (
    <Action.Open title="Open in Slack" target={link} application="Slack" />
  );
}

// 標準絵文字を選んで、メッセージにリアクションを付ける。reactions:write だけで動く
export function AddReactionList({
  session,
  hit,
}: {
  session: Session;
  hit: Hit;
}) {
  const [query, setQuery] = useState("");
  const change = useReactionChange(session, hit, "add");
  const results = useMemo(() => searchEmoji(query), [query]);
  return (
    <List
      navigationTitle="Add Reaction"
      searchBarPlaceholder="Search emoji by name or keyword"
      filtering={false}
      onSearchTextChange={setQuery}
      isLoading={change.busy}
    >
      <List.EmptyView
        title={
          session.canFetch
            ? "No matching emoji"
            : "Cannot react before authentication completes"
        }
        description={
          session.canFetch
            ? "Standard emoji only. Try another name or keyword"
            : "Check your Slack Access Token and reopen Slack Compass"
        }
        actions={
          <ActionPanel>
            <OpenInSlack link={change.link} />
          </ActionPanel>
        }
      />
      {session.canFetch
        ? results.map((emoji) => (
            <List.Item
              key={emoji.name}
              id={emoji.name}
              title={emojiTitle(emoji.name)}
              actions={
                <ActionPanel>
                  {change.unconfirmed ? null : (
                    <Action
                      title="Add Reaction"
                      icon={Icon.Emoji}
                      onAction={() => change.run(emoji.name)}
                    />
                  )}
                  <OpenInSlack link={change.link} />
                </ActionPanel>
              }
            />
          ))
        : null}
    </List>
  );
}

type MineState =
  | { status: "loading" }
  | ({ status: "ready" } & MyReactions)
  | { status: "failed"; message: string };

// 自分が付けたリアクションだけを並べて、選んだものを外す。reactions:read と reactions:write が要る
export function RemoveReactionList({
  session,
  hit,
}: {
  session: Session;
  hit: Hit;
}) {
  const change = useReactionChange(session, hit, "remove");
  const [mine, setMine] = useState<MineState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const { api, canFetch, fetchAs } = session;
  const selfId = fetchAs?.userId;
  const { channelId, ts } = hit;
  useEffect(() => {
    if (!canFetch || !selfId) return;
    const abort = new AbortController();
    setMine({ status: "loading" });
    void fetchMyReactions(api, { channelId, ts }, selfId, abort.signal).then(
      (result) => {
        if (abort.signal.aborted) return;
        setMine(
          result.kind === "ready"
            ? {
                status: "ready",
                names: result.names,
                unremovable: result.unremovable,
                incomplete: result.incomplete,
              }
            : { status: "failed", message: result.message },
        );
      },
    );
    return () => abort.abort();
  }, [api, canFetch, selfId, channelId, ts, nonce]);
  // 外せない名前の件数・一覧が不完全かもしれないことの案内
  const notices = mine.status === "ready" ? mineNotices(mine) : [];
  const title = !canFetch
    ? "Cannot react before authentication completes"
    : mine.status === "loading"
      ? "Loading your reactions"
      : mine.status === "failed"
        ? "Could not load your reactions"
        : notices.length > 0
          ? "No reactions you can remove were found"
          : "You have no reactions on this message";
  const description = !canFetch
    ? "Check your Slack Access Token and reopen Slack Compass"
    : mine.status === "failed"
      ? mine.message
      : notices.length > 0
        ? notices.join(". ")
        : undefined;
  return (
    <List
      navigationTitle="Remove My Reaction"
      searchBarPlaceholder="Filter your reactions"
      isLoading={canFetch && (mine.status === "loading" || change.busy)}
    >
      <List.EmptyView
        title={title}
        description={description}
        actions={
          <ActionPanel>
            {canFetch ? (
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={() => setNonce((value) => value + 1)}
              />
            ) : null}
            <OpenInSlack link={change.link} />
          </ActionPanel>
        }
      />
      {canFetch && mine.status === "ready" && mine.names.length > 0 ? (
        <List.Section
          title="Your reactions"
          subtitle={notices.length > 0 ? notices.join(". ") : undefined}
        >
          {mine.names.map((name) => (
            <List.Item
              key={name}
              id={name}
              title={emojiTitle(name)}
              actions={
                <ActionPanel>
                  {change.unconfirmed ? null : (
                    <Action
                      title="Remove My Reaction"
                      icon={Icon.XMarkCircle}
                      onAction={() => change.run(name)}
                    />
                  )}
                  <OpenInSlack link={change.link} />
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={Keyboard.Shortcut.Common.Refresh}
                    onAction={() => setNonce((value) => value + 1)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
