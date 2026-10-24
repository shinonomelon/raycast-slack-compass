import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { useState } from "react";
import type { MembershipContext } from "./membership-context.ts";
import { allMatches, memberRows } from "./membership-view.ts";
export function PersonPicker({
  context,
  ids,
  remove = false,
  onSelect,
}: {
  context: MembershipContext;
  ids: readonly string[];
  remove?: boolean;
  onSelect: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const { pop } = useNavigation();
  const self = context.session.canFetch ? context.session.fetchAs : undefined;
  const people =
    self && !context.people.some((person) => person.id === self.userId)
      ? [
          ...context.people,
          {
            id: self.userId,
            handle: self.user,
            displayName: "You",
            realName: "You",
            title: "",
            isBot: false,
          },
        ]
      : context.people;
  const candidates = remove
    ? [...ids]
    : people
        .filter((person) => !person.isBot && !ids.includes(person.id))
        .map((person) => person.id);
  const rows = allMatches(memberRows(candidates, people, context.prefs), text);
  return (
    <List
      navigationTitle={remove ? "Remove Person" : "Add Person"}
      searchBarPlaceholder="Search by name"
      searchText={text}
      onSearchTextChange={setText}
      filtering={false}
    >
      <List.EmptyView title="No matching people" />
      {rows.map((row) => (
        <List.Item
          key={row.id}
          title={row.title}
          subtitle={row.id === self?.userId ? "You" : row.subtitle}
          icon={Icon.Person}
          actions={
            <ActionPanel>
              <Action
                title={remove ? "Remove Person" : "Add Person"}
                onAction={() => {
                  onSelect(row.id);
                  pop();
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
