import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  List,
  confirmAlert,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import type { Conversation } from "../../shared/types.ts";
import type { ChannelLibrary, LibraryMutation } from "./model.ts";
export type LibraryMutator = (
  mutation: LibraryMutation,
) => Promise<ChannelLibrary | false>;
type Props = {
  library: ChannelLibrary;
  conversations: readonly Conversation[];
  onMutate: LibraryMutator;
};
function MutationForm({
  title,
  initialName,
  initialIds,
  conversations,
  onSave,
}: {
  title: string;
  initialName?: string;
  initialIds?: string[];
  conversations?: readonly Conversation[];
  onSave: (name: string, ids: string[]) => Promise<boolean>;
}) {
  const { pop } = useNavigation();
  const [name, setName] = useState(initialName ?? "");
  const [ids, setIds] = useState(initialIds ?? []);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    if (!conversations && !name.trim()) {
      setError("Enter a name");
      return;
    }
    setSaving(true);
    try {
      if (await onSave(name.trim(), ids)) pop();
      else
        setError(
          "Could not save. Check for duplicate names or a problem with the channel library file",
        );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  const known = new Set(
    conversations?.filter((c) => c.type !== "mpim").map((c) => c.id),
  );
  return (
    <Form
      navigationTitle={title}
      isLoading={saving}
      actions={
        <ActionPanel>
          <Action title="Save" onAction={save} />
        </ActionPanel>
      }
    >
      {conversations ? (
        <Form.TagPicker
          id="channels"
          title="Channels in Section"
          value={ids}
          onChange={setIds}
          error={error}
        >
          {[...conversations]
            .filter((c) => c.type !== "mpim")
            .sort((a, b) => a.name.localeCompare(b.name, "ja"))
            .map((c) => (
              <Form.TagPicker.Item
                key={c.id}
                value={c.id}
                title={`#${c.name}`}
              />
            ))}
          {initialIds
            ?.filter((id) => !known.has(id))
            .map((id) => (
              <Form.TagPicker.Item
                key={id}
                value={id}
                title={`${id} (currently unavailable)`}
              />
            ))}
        </Form.TagPicker>
      ) : (
        <Form.TextField
          id="name"
          title="Section Name"
          value={name}
          onChange={setName}
          error={error}
        />
      )}
      <Form.Description text="Changes take effect when saved. Favorites and section membership are independent." />
    </Form>
  );
}
export function SectionScreen({
  library: initial,
  conversations,
  onMutate,
}: Props) {
  const { push } = useNavigation();
  const [library, setLibrary] = useState(initial);
  const [error, setError] = useState<string>();
  const mutate = async (mutation: LibraryMutation) => {
    const result = await onMutate(mutation);
    if (result) {
      setLibrary(result);
      setError(undefined);
      return true;
    }
    setError("Could not save the channel library");
    return false;
  };
  const create = (
    <Action
      title="Create Section"
      icon={Icon.Plus}
      onAction={() =>
        push(
          <MutationForm
            title="Create Section"
            onSave={(name) => mutate({ kind: "create-section", name })}
          />,
        )
      }
    />
  );
  return (
    <List
      navigationTitle="Manage Sections"
      searchBarPlaceholder="Search sections"
      actions={<ActionPanel>{create}</ActionPanel>}
    >
      {error && (
        <List.Item
          title={error}
          icon={Icon.Warning}
          actions={<ActionPanel>{create}</ActionPanel>}
        />
      )}
      {[...library.sections]
        .sort((a, b) => a.name.localeCompare(b.name, "ja"))
        .map((section) => (
          <List.Item
            key={section.id}
            title={section.name}
            subtitle={`${section.channelIds.length} channels`}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action
                  title="Edit Channels"
                  onAction={() =>
                    push(
                      <MutationForm
                        title={`Channels in ${section.name}`}
                        initialIds={section.channelIds}
                        conversations={conversations}
                        onSave={(_, channelIds) =>
                          mutate({
                            kind: "set-section-channels",
                            sectionId: section.id,
                            channelIds,
                          })
                        }
                      />,
                    )
                  }
                />
                <Action
                  title="Rename"
                  onAction={() =>
                    push(
                      <MutationForm
                        title="Rename"
                        initialName={section.name}
                        onSave={(name) =>
                          mutate({
                            kind: "rename-section",
                            sectionId: section.id,
                            name,
                          })
                        }
                      />,
                    )
                  }
                />
                {create}
                <Action
                  title="Delete Section"
                  style={Action.Style.Destructive}
                  onAction={async () => {
                    if (
                      await confirmAlert({
                        title: `Delete "${section.name}"?`,
                        message:
                          "This removes the section and its channel membership settings.",
                        primaryAction: {
                          title: "Delete",
                          style: Alert.ActionStyle.Destructive,
                        },
                      })
                    )
                      await mutate({
                        kind: "delete-section",
                        sectionId: section.id,
                      });
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      <List.EmptyView
        title="No sections"
        description="Create a section from Actions"
        actions={<ActionPanel>{create}</ActionPanel>}
      />
    </List>
  );
}
export function SectionMembershipForm({
  library,
  channelId,
  channelName,
  onMutate,
}: {
  library: ChannelLibrary;
  channelId: string;
  channelName: string;
  onMutate: LibraryMutator;
}) {
  const { pop } = useNavigation();
  const [sectionIds, setSectionIds] = useState(
    library.sections
      .filter((s) => s.channelIds.includes(channelId))
      .map((s) => s.id),
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  return (
    <Form
      navigationTitle={`Sections for #${channelName}`}
      isLoading={saving}
      actions={
        <ActionPanel>
          <Action
            title="Save"
            onAction={async () => {
              if (saving) return;
              setSaving(true);
              try {
                if (
                  await onMutate({
                    kind: "set-channel-sections",
                    channelId,
                    sectionIds,
                  })
                )
                  pop();
                else setError("Could not save. Please try again");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "Could not save",
                );
              } finally {
                setSaving(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TagPicker
        id="sections"
        title="Sections"
        value={sectionIds}
        onChange={setSectionIds}
        error={error}
      >
        {[...library.sections]
          .sort((a, b) => a.name.localeCompare(b.name, "ja"))
          .map((s) => (
            <Form.TagPicker.Item key={s.id} value={s.id} title={s.name} />
          ))}
      </Form.TagPicker>
      <Form.Description text="A channel can belong to multiple sections. Removing a favorite does not change its sections." />
    </Form>
  );
}
