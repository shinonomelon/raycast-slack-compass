import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { ChannelLibrary } from "../channel-library/model.ts";
import { DEFAULT_SEARCH_SCOPE, validateScopeSelection } from "./model.ts";

type Node = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Node => ({
  type,
  props,
});
const initial: ChannelLibrary = {
  version: 1,
  teamId: "T1",
  userId: "U1",
  favoriteChannelIds: [],
  sections: [],
};

// 実際の親画面の管理コールバックとフォームを動かし、フォームへ戻った後の再オープンを確認する。
function harness() {
  const path = "src/features/hub/hub-screen.tsx";
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let manage = "";
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === "onManage" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    ) {
      manage = node.initializer.expression!.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(manage);
  let current = initial;
  let next = initial;
  const pushed: Node[] = [];
  const mutation = async () => (current = next);
  const exports: {
    manage?: (
      library: ChannelLibrary,
      onChange: (library: ChannelLibrary) => void,
    ) => void;
  } = {};
  runInNewContext(
    ts.transpileModule(`export const manage = ${manage}`, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      require: () => ({ jsx, jsxs: jsx }),
      push: (node: Node) => pushed.push(node),
      SectionScreen: "SectionScreen",
      library: { library: initial, mutate: mutation },
      conversations: { data: [] },
      scopeControls: { conversations: [], onMutate: mutation },
      libraryRef: { current: initial },
      setLibrary: (value: ChannelLibrary) => {
        current = value;
      },
    },
  );
  const slots: unknown[] = [];
  let cursor = 0;
  const formExports: { ScopeForm?: (props: unknown) => Node } = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync("src/features/search-scope/scope-form.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports: formExports,
      require: (id: string) =>
        ({
          "react/jsx-runtime": { jsx, jsxs: jsx },
          "@raycast/api": {
            Action: "Action",
            ActionPanel: "ActionPanel",
            Form: Object.assign("Form", {
              Dropdown: Object.assign("Dropdown", { Item: "Item" }),
              Description: "Description",
            }),
            useNavigation: () => ({ pop: () => {} }),
          },
          react: {
            useState: (initialValue: unknown) => {
              const index = cursor++;
              if (!(index in slots)) slots[index] = initialValue;
              return [
                slots[index],
                (value: unknown) => {
                  slots[index] = value;
                },
              ];
            },
          },
          "./model.ts": { DEFAULT_SEARCH_SCOPE, validateScopeSelection },
        })[id],
    },
  );
  function nodes(value: unknown): Node[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object" || !("props" in value)) return [];
    const node = value as Node;
    return [node, ...Object.values(node.props).flatMap(nodes)];
  }
  let lastForm: Node;
  function open() {
    cursor = 0;
    const tree = formExports.ScopeForm!({
      scope: DEFAULT_SEARCH_SCOPE,
      library: initial,
      conversations: [],
      people: [],
      selfId: "U1",
      onApply: () => {},
      onManage: exports.manage,
    });
    lastForm = tree;
    const action = nodes(tree).find(
      (node) => node.props.title === "Manage Sections",
    )!;
    (action.props.onAction as () => void)();
    return pushed.at(-1)!;
  }
  // 任意の props で描画し直す。cursor を戻すので、useState の値は前の描画から引き継がれる
  function render(props: Record<string, unknown>) {
    cursor = 0;
    lastForm = formExports.ScopeForm!({
      scope: DEFAULT_SEARCH_SCOPE,
      library: initial,
      conversations: [],
      people: [],
      selfId: "U1",
      onApply: () => {},
      ...props,
    });
    return nodes(lastForm);
  }
  return {
    open,
    render,
    formNodes: () => nodes(lastForm),
    update: async (section: ChannelLibrary["sections"][number]) => {
      next = { ...current, sections: [section] };
      await (
        pushed.at(-1)!.props.onMutate as (mutation: unknown) => Promise<unknown>
      )({ kind: "create-section", name: section.name });
      return next;
    },
  };
}

test(`hubの条件フォームは管理画面で作成・更新後に戻って開き直すと最新一覧を渡す`, async () => {
  const ui = harness();
  assert.equal(ui.open().props.library, initial);
  const created = await ui.update({ id: "s1", name: "新規", channelIds: [] });
  assert.equal(ui.open().props.library, created);
  const renamed = await ui.update({
    id: "s1",
    name: "更新済み",
    channelIds: ["C1"],
  });
  assert.equal(ui.open().props.library, renamed);
});

test("検索条件フォームは項目・操作を英語にし、管理後の利用者のセクション名は保持する", async () => {
  const ui = harness();
  ui.open();
  const form = ui.formNodes();
  assert.equal(form[0].props.navigationTitle, "Choose Search Filters");
  const titles = form.map((node) => node.props.title);
  for (const title of [
    "Apply",
    "Show Messages",
    "Clear Filters and Apply",
    "Manage Sections",
    "Search Scope",
    "Sender",
    "Recipient",
  ])
    assert.ok(titles.includes(title), title);
  const updated = await ui.update({
    id: "s1",
    name: "日本語のセクション",
    channelIds: ["C1"],
  });
  assert.equal(ui.open().props.library, updated);
  assert.equal(updated.sections[0].name, "日本語のセクション");
});

const people = [
  { id: "U1", handle: "me", displayName: "Hanako", realName: "Hanako" },
  { id: "U2", handle: "alice", displayName: "Alice", realName: "Alice A" },
  { id: "U3", handle: "bob", displayName: "", realName: "Bob B" },
].map((p) => ({ ...p, title: "", isBot: false }));

// vm の中で作られたオブジェクトは prototype が違い、deepEqual が通らない。JSON を経由して比べる
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const isType = (node: Node, type: string) => String(node.type) === type;

// 親の Dropdown の children から、選択肢の value と title を取り出す
function itemsOf(form: Node[], id: string): { value: string; title: string }[] {
  const dropdown = form.find(
    (node) => isType(node, "Dropdown") && node.props.id === id,
  );
  assert.ok(dropdown, id);
  return [dropdown!.props.children]
    .flat(3)
    .filter((child): child is Node => !!child && typeof child === "object")
    .map((child) => child.props as { value: string; title: string });
}

test("検索条件フォームは送信者に Me、宛先に Me と人、範囲に Direct Message を出す", () => {
  const ui = harness();
  const form = ui.render({ people });
  assert.deepEqual(
    itemsOf(form, "sender").map((i) => [i.value, i.title]),
    [
      ["", "None"],
      ["U1", "Me"],
      ["U2", "Alice"],
      ["U3", "Bob B"],
    ],
  );
  assert.deepEqual(
    itemsOf(form, "recipient").map((i) => [i.value, i.title]),
    [
      ["", "None"],
      ["me", "Mentions and DMs to Me"],
      ["U2", "Alice"],
      ["U3", "Bob B"],
    ],
  );
  assert.ok(
    itemsOf(form, "range").some(
      (i) => i.value === "dm" && i.title === "Direct Message",
    ),
  );
  // 項目には placeholder を付ける
  for (const id of ["range", "sender", "recipient"])
    assert.ok(
      form.find((n) => n.props.id === id)?.props.placeholder,
      `${id} placeholder`,
    );
});

test("検索条件フォームで選んだ送信者 Me・宛先 Me・DM を、検索条件として適用する", () => {
  const ui = harness();
  const applied: unknown[] = [];
  const props = {
    people,
    onApply: (scope: unknown, options: unknown) =>
      applied.push([scope, options]),
  };
  let form = ui.render(props);
  const change = (id: string, value: string) => {
    const dropdown = form.find((n) => n.props.id === id)!;
    (dropdown.props.onChange as (value: string) => void)(value);
    form = ui.render(props);
  };
  const run = (title: string) =>
    (form.find((n) => n.props.title === title)!.props.onAction as () => void)();
  change("sender", "U1");
  change("recipient", "me");
  run("Apply");
  assert.deepEqual(plain(applied.pop()), [
    {
      range: { kind: "all" },
      senderId: "U1",
      recipient: { kind: "me" },
    },
    { showMessages: false },
  ]);
  change("recipient", "U3");
  run("Show Messages");
  assert.deepEqual(plain(applied.pop()), [
    {
      range: { kind: "all" },
      senderId: "U1",
      recipient: { kind: "person", userId: "U3" },
    },
    { showMessages: true },
  ]);
  // Direct Message を選ぶと相手の選択肢が出る。最初の人が既定で、変えるとその人との DM になる
  change("range", "dm");
  assert.deepEqual(
    itemsOf(form, "dm").map((i) => i.value),
    ["U2", "U3"],
  );
  change("dm", "U3");
  run("Apply");
  assert.deepEqual(plain(applied.pop()), [
    {
      range: { kind: "dm", userId: "U3" },
      senderId: "U1",
      recipient: { kind: "person", userId: "U3" },
    },
    { showMessages: false },
  ]);
  change("sender", "");
  change("recipient", "");
  run("Apply");
  assert.deepEqual(plain(applied.pop()), [
    { range: { kind: "dm", userId: "U3" } },
    { showMessages: false },
  ]);
});

test("検索条件フォームは開いたときに、いまの宛先と DM の相手を選んだ状態にする", () => {
  const ui = harness();
  const form = ui.render({
    people,
    scope: {
      range: { kind: "dm", userId: "U2" },
      recipient: { kind: "person", userId: "U3" },
    },
  });
  assert.equal(form.find((n) => n.props.id === "range")!.props.value, "dm");
  assert.equal(form.find((n) => n.props.id === "dm")!.props.value, "U2");
  assert.equal(form.find((n) => n.props.id === "recipient")!.props.value, "U3");
});

test("検索条件フォームは Show Messages に条件が1つも無いと案内し、宛先だけでも通す", () => {
  const ui = harness();
  const applied: unknown[] = [];
  const props = { people, onApply: (scope: unknown) => applied.push(scope) };
  let form = ui.render(props);
  const run = (title: string) =>
    (form.find((n) => n.props.title === title)!.props.onAction as () => void)();
  run("Show Messages");
  assert.equal(applied.length, 0);
  form = ui.render(props);
  assert.equal(
    form.find((n) => isType(n, "Description"))!.props.text,
    "Select a scope, sender, or recipient",
  );
  (
    form.find((n) => n.props.id === "recipient")!.props.onChange as (
      value: string,
    ) => void
  )("me");
  form = ui.render(props);
  run("Show Messages");
  assert.equal(applied.length, 1);
});

test("検索条件フォームは、必ず空になる組み合わせを Apply の時点で英語で案内する", () => {
  const ui = harness();
  const applied: unknown[] = [];
  const props = {
    people,
    conversations: [{ id: "C1", name: "one", type: "public" }],
    scope: {
      range: { kind: "all" },
      recipient: { kind: "person", userId: "U2" },
    },
    onApply: (scope: unknown) => applied.push(scope),
  };
  let form = ui.render(props);
  const change = (id: string, value: string) => {
    (
      form.find((n) => n.props.id === id)!.props.onChange as (v: string) => void
    )(value);
    form = ui.render(props);
  };
  const run = (title: string) =>
    (form.find((n) => n.props.title === title)!.props.onAction as () => void)();
  // 人宛てとチャンネル範囲
  change("range", "channel");
  assert.equal(
    form.find((n) => n.props.id === "channel")?.type !== undefined,
    true,
  );
  run("Apply");
  assert.equal(applied.length, 0);
  form = ui.render(props);
  assert.equal(
    form.find((n) => n.props.id === "channel")!.props.error,
    "A recipient other than you matches DMs only. Set the scope to All or a DM",
  );
  // 範囲を All に戻せば通る
  change("range", "all");
  run("Apply");
  assert.equal(applied.length, 1);
});
