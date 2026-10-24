import { useThreadContext } from "../hub/use-thread-context.ts";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  openExtensionPreferences,
} from "@raycast/api";
import { useState } from "react";
import type { Conversation } from "../../shared/types.ts";
import { DETAILS_SHORTCUT } from "../hub/shortcuts.ts";
import { MessageRow } from "../hub/message-row.tsx";
import { textWithFilter } from "../hub/view-order.ts";
import { useMessageSearch } from "../search/use-message-search.ts";
import type { MembershipContext } from "./membership-context.ts";
export function ConversationMessages({
  context,
  channel,
}: {
  context: MembershipContext;
  channel: Conversation;
}) {
  const [text, setText] = useState("");
  const [detail, setDetail] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const expression = `in:<#${channel.id}>${text.trim() ? ` ${text.trim()}` : ""}`;
  const search = useMessageSearch(expression, context.session);
  const hits =
    context.session.canFetch && search.query === expression ? search.hits : [];
  const threadDetail = useThreadContext(
    context.session,
    hits.find((hit) => hit.key === activeRowId),
    detail,
  );
  const common = (
    <>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        onAction={search.revalidate}
      />
      <Action
        title="Open Extension Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </>
  );
  const status = !context.session.canFetch
    ? "Check authentication and reopen Slack Compass"
    : search.status?.query === expression && search.status.kind === "failed"
      ? search.status.message
      : search.status?.query === expression && search.status.kind === "paused"
        ? `Search paused until ${new Date(search.status.pause.until).toLocaleTimeString("en-US")}`
        : search.isLoading
          ? "Searching"
          : "No matching messages in this channel";
  return (
    <List
      navigationTitle={`Search in #${channel.name}`}
      searchBarPlaceholder="Search messages in this channel"
      searchText={text}
      onSearchTextChange={setText}
      filtering={false}
      isLoading={search.isLoading}
      isShowingDetail={detail}
      onSelectionChange={setActiveRowId}
    >
      <List.EmptyView
        title={status}
        description={`Searching: #${channel.name}`}
        actions={
          <ActionPanel>
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              onAction={search.revalidate}
            />
            {detail ? (
              <Action
                title="Hide Details"
                icon={Icon.Sidebar}
                shortcut={DETAILS_SHORTCUT}
                onAction={() => setDetail(false)}
              />
            ) : null}
            <Action
              title="Open Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      />
      {hits.map((hit) => (
        <MessageRow
          key={hit.key}
          id={hit.key}
          session={context.session}
          hit={hit}
          names={context.names}
          state={context.isMarked(hit) ? "handled" : undefined}
          marked={context.isMarked(hit)}
          showDetail={detail}
          threadDetail={
            detail && hit.key === activeRowId ? threadDetail : undefined
          }
          onToggleDetail={() => setDetail((value) => !value)}
          conversationFilter={undefined}
          senderFilter={
            context.names.handleOf(hit.userId)
              ? `from:<@${hit.userId}>`
              : undefined
          }
          onFilter={(filter) =>
            setText((current) => textWithFilter(current, filter, "message"))
          }
          onOpen={() => {
            context.markOpened(hit);
            redraw((value) => value + 1);
          }}
          onReplied={() => {
            context.markReplied(hit);
            redraw((value) => value + 1);
          }}
          onToggleHandled={() => {
            context.toggleHandled(hit);
            redraw((value) => value + 1);
          }}
          membershipContext={context}
          common={common}
        />
      ))}
    </List>
  );
}
