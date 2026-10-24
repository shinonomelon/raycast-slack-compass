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
  const [senderId, setSenderId] = useState(scope.senderId ?? "");
  const [error, setError] = useState<string>();
  const apply = (showMessages = false) => {
    const range: SearchScope["range"] =
      kind === "section"
        ? { kind, sectionId }
        : kind === "channel"
          ? { kind, channelId }
          : { kind };
    const next = { range, ...(senderId ? { senderId } : {}) };
    const invalid = validateScopeSelection(
      next,
      library,
      conversations,
      showMessages,
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
      <Form.Dropdown
        id="sender"
        title="Sender"
        value={senderId}
        onChange={(id) => {
          setSenderId(id);
          setError(undefined);
        }}
      >
        <Form.Dropdown.Item value="" title="None" />
        {people.map((p) => (
          <Form.Dropdown.Item
            key={p.id}
            value={p.id}
            title={p.displayName || p.realName || p.handle}
          />
        ))}
      </Form.Dropdown>
      <Form.Description
        text={
          error ??
          "Find messages matching both the scope and sender. Search starts only after applying the filters."
        }
      />
    </Form>
  );
}
