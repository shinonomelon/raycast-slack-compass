import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { useState } from "react";
import type { Conversation, Person } from "../../shared/types.ts";
import type { ChannelLibrary } from "../channel-library/model.ts";
import {
  DEFAULT_SEARCH_SCOPE,
  validateScopeSelection,
  type SearchScope,
} from "./model.ts";
export type ScopeFormProps = {
  scope: SearchScope;
  library: ChannelLibrary;
  conversations: readonly Conversation[];
  people: readonly Person[];
  // 自分のユーザー ID。送信者・宛先の Me と、人の一覧から自分を除くのに使う
  selfId: string;
  onApply: (
    scope: SearchScope,
    options: {
      showMessages?: boolean;
    },
  ) => void;
  onManage?: (
    library: ChannelLibrary,
    onChange: (library: ChannelLibrary) => void,
  ) => void;
};
export function ScopeForm({
  scope,
  library: initialLibrary,
  conversations,
  people,
  selfId,
  onApply,
  onManage,
}: ScopeFormProps) {
  const { pop } = useNavigation();
  const [library, setLibrary] = useState(initialLibrary);
  const [kind, setKind] = useState<SearchScope["range"]["kind"]>(
    scope.range.kind,
  );
  const [sectionId, setSectionId] = useState(
    scope.range.kind === "section"
      ? scope.range.sectionId
      : (library.sections[0]?.id ?? ""),
  );
  const channels = conversations
    .filter((c) => c.type !== "mpim")
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const [channelId, setChannelId] = useState(
    scope.range.kind === "channel"
      ? scope.range.channelId
      : (channels[0]?.id ?? ""),
  );
  // 人の選択肢。自分は Me として別に出すので、ここには含めない
  const others = people.filter((p) => p.id !== selfId);
  const nameOf = (p: Person) => p.displayName || p.realName || p.handle;
  const [dmUserId, setDmUserId] = useState(
    scope.range.kind === "dm" ? scope.range.userId : (others[0]?.id ?? ""),
  );
  const [senderId, setSenderId] = useState(scope.senderId ?? "");
  // 宛先の選択値。"" は指定なし、"me" は自分宛て、それ以外は人のユーザー ID
  const [recipientValue, setRecipientValue] = useState(
    scope.recipient?.kind === "me"
      ? "me"
      : scope.recipient?.kind === "person"
        ? scope.recipient.userId
        : "",
  );
  const [error, setError] = useState<string>();
  const apply = (showMessages = false) => {
    const range: SearchScope["range"] =
      kind === "section"
        ? { kind, sectionId }
        : kind === "channel"
          ? { kind, channelId }
          : kind === "dm"
            ? { kind, userId: dmUserId }
            : { kind };
    const recipient: SearchScope["recipient"] =
      recipientValue === "me"
        ? { kind: "me" }
        : recipientValue
          ? { kind: "person", userId: recipientValue }
          : undefined;
    const next: SearchScope = {
      range,
      ...(senderId ? { senderId } : {}),
      ...(recipient ? { recipient } : {}),
    };
    const invalid = validateScopeSelection(
      next,
      library,
      conversations,
      showMessages,
      selfId,
    );
    if (invalid) {
      setError(invalid);
      return;
    }
    onApply(next, { showMessages });
    pop();
  };
  return (
    <Form
      navigationTitle="Choose Search Filters"
      actions={
        <ActionPanel>
          <Action title="Apply" onAction={() => apply()} />
          <Action title="Show Messages" onAction={() => apply(true)} />
          <Action
            title="Clear Filters and Apply"
            onAction={() => {
              onApply(DEFAULT_SEARCH_SCOPE, {});
              pop();
            }}
          />
          {onManage && (
            <Action
              title="Manage Sections"
              onAction={() =>
                onManage(library, (next) => {
                  setLibrary(next);
                  setError(undefined);
                })
              }
            />
          )}
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="range"
        title="Search Scope"
        placeholder="Choose a search scope"
        value={kind}
        onChange={(value) => {
          setKind(value as typeof kind);
          setError(undefined);
        }}
      >
        <Form.Dropdown.Item value="all" title="All" />
        <Form.Dropdown.Item value="favorites" title="Favorite Channels" />
        <Form.Dropdown.Item value="section" title="Section" />
        <Form.Dropdown.Item value="channel" title="Channels" />
        <Form.Dropdown.Item value="dm" title="Direct Message" />
      </Form.Dropdown>
      {kind === "section" && (
        <Form.Dropdown
          id="section"
          title="Section"
          value={sectionId}
          onChange={setSectionId}
          error={error}
        >
          {!library.sections.some((section) => section.id === sectionId) && (
            <Form.Dropdown.Item
              value={sectionId}
              title={
                sectionId
                  ? "The selected section was deleted"
                  : "Choose a section"
              }
            />
          )}
          {[...library.sections]
            .sort((a, b) => a.name.localeCompare(b.name, "ja"))
            .map((s) => (
              <Form.Dropdown.Item key={s.id} value={s.id} title={s.name} />
            ))}
        </Form.Dropdown>
      )}
      {kind === "channel" && (
        <Form.Dropdown
          id="channel"
          title="Channels"
          value={channelId}
          onChange={setChannelId}
          error={error}
        >
          {channels.map((c) => (
            <Form.Dropdown.Item key={c.id} value={c.id} title={`#${c.name}`} />
          ))}
        </Form.Dropdown>
      )}
      {kind === "dm" && (
        <Form.Dropdown
          id="dm"
          title="Direct Message With"
          placeholder="Choose a person"
          info="Searches only your DM with this person"
          filtering
          value={dmUserId}
          onChange={(id) => {
            setDmUserId(id);
            setError(undefined);
          }}
          error={error}
        >
          {dmUserId && !others.some((p) => p.id === dmUserId) && (
            <Form.Dropdown.Item value={dmUserId} title="Selected Person" />
          )}
          {others.map((p) => (
            <Form.Dropdown.Item key={p.id} value={p.id} title={nameOf(p)} />
          ))}
        </Form.Dropdown>
      )}
      <Form.Dropdown
        id="sender"
        title="Sender"
        placeholder="Choose who posted the message"
        info="Messages posted by this person"
        filtering
        value={senderId}
        onChange={(id) => {
          setSenderId(id);
          setError(undefined);
        }}
      >
        <Form.Dropdown.Item value="" title="None" />
        {selfId && <Form.Dropdown.Item value={selfId} title="Me" />}
        {senderId &&
          senderId !== selfId &&
          !others.some((p) => p.id === senderId) && (
            <Form.Dropdown.Item value={senderId} title="Selected Sender" />
          )}
        {others.map((p) => (
          <Form.Dropdown.Item key={p.id} value={p.id} title={nameOf(p)} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="recipient"
        title="Recipient"
        placeholder="Choose who the message was sent to"
        info="Mentions and DMs to Me finds messages that mention you and DMs sent to you. A person finds the DMs sent to that person"
        filtering
        value={recipientValue}
        onChange={(value) => {
          setRecipientValue(value);
          setError(undefined);
        }}
      >
        <Form.Dropdown.Item value="" title="None" />
        <Form.Dropdown.Item value="me" title="Mentions and DMs to Me" />
        {recipientValue &&
          recipientValue !== "me" &&
          !others.some((p) => p.id === recipientValue) && (
            <Form.Dropdown.Item
              value={recipientValue}
              title="Selected Recipient"
            />
          )}
        {others.map((p) => (
          <Form.Dropdown.Item key={p.id} value={p.id} title={nameOf(p)} />
        ))}
      </Form.Dropdown>
      <Form.Description
        text={
          error ??
          "Find messages matching the scope, sender, and recipient together. Search starts only after applying the filters."
        }
      />
    </Form>
  );
}
