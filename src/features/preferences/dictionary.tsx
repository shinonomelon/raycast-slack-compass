import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Form,
  Icon,
  Keyboard,
  List,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { normalize, type DictionaryRule } from "../search/search.ts";
function AddRule({ onSubmit }: { onSubmit: (rule: DictionaryRule) => void }) {
  const { pop } = useNavigation();
  const [fromError, setFromError] = useState<string>();
  return (
    <Form
      navigationTitle="Add Replacement"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add"
            onSubmit={(values: { from: string; to: string }) => {
              if (!values.from.trim()) {
                setFromError("Enter the text to replace");
                return;
              }
              onSubmit({ from: values.from.trim(), to: values.to.trim() });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="from"
        title="Channel Name Text"
        placeholder="Documents"
        error={fromError}
        onChange={() => setFromError(undefined)}
      />
      <Form.TextField id="to" title="Your Replacement" placeholder="docs" />
      <Form.Description text="Match channel and group DM names using alternative text. Example: replacing documents → docs lets you find a documents channel by searching for docs" />
    </Form>
  );
}
// 名前の置き換え辞書の一覧。規則ごとに、当たるチャンネルの数を出す
export function Dictionary({
  rules: initialRules,
  names,
  onChange,
}: {
  rules: readonly DictionaryRule[];
  names: readonly string[];
  onChange: (rules: DictionaryRule[]) => void;
}) {
  // 押し出された画面は親の再描画を受けないので、自分でも規則を持つ
  const [rules, setRules] = useState<DictionaryRule[]>([...initialRules]);
  const normalizedNames = names.map(normalize);
  const update = (next: DictionaryRule[]) => {
    setRules(next);
    onChange(next);
  };
  const addAction = (
    <Action.Push
      title="Add Rule"
      icon={Icon.Plus}
      shortcut={Keyboard.Shortcut.Common.New}
      target={<AddRule onSubmit={(rule) => update([...rules, rule])} />}
    />
  );
  return (
    <List navigationTitle="Name Replacement Dictionary">
      <List.EmptyView
        title="No replacements yet"
        description="Use Add Rule in Actions (example: documents → docs)"
        actions={<ActionPanel>{addAction}</ActionPanel>}
      />
      {rules.map((rule, index) => {
        const from = normalize(rule.from);
        const hits = normalizedNames.filter((n) => n.includes(from)).length;
        return (
          <List.Item
            key={`${rule.from}-${index}`}
            title={`${rule.from} → ${rule.to}`}
            accessories={[{ text: `${hits} results` }]}
            actions={
              <ActionPanel>
                {addAction}
                <Action
                  title="Delete Rule"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={async () => {
                    const ok = await confirmAlert({
                      title: `Delete ${rule.from} → ${rule.to}?`,
                      primaryAction: {
                        title: "Delete",
                        style: Alert.ActionStyle.Destructive,
                      },
                    });
                    if (ok) update(rules.filter((_, i) => i !== index));
                  }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
