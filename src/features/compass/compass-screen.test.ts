import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as compassScope from "../search-scope/compass-scope.ts";
import { countLabel } from "../../shared/plural.ts";
import * as orderFunctions from "./view-order.ts";

// 実際のSlack Compassの描画部分を使い、Raycast本体を起動せず検索条件変更中の行を検査する。
// JSXは値として受け取り、通信や画面操作は行わない。
const source = readFileSync("src/features/compass/compass-screen.tsx", "utf8");
const marker = source.indexOf("// メッセージ：検索結果");
const start = source.indexOf("        if (!statusRow", marker);
const end = source.indexOf("\n      })}", start);
assert.ok(marker >= 0 && start >= 0 && end > start);
const guard = source.match(/ {2}const messageHits =[\s\S]*?;\n/)?.[0] ?? "";
const compiled = ts.transpileModule(
  `export function render(search, resolved, session, rows, statusRow) {
    const List = { Section: "section" };
    const filterLabels = resolved.filters.map(f => f.modifier + ":" + f.label).join(" ");
    const scopeSummary = session.scopeSummary;
    const messageRow = hit => { rows.push(hit); return hit; };
    const messageRowId = hit => hit.key;
    const triage = { marks: new Set() };
    ${guard}
    ${source.slice(start, end)}
  }`,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
type Search = { query?: string; hits: { key: string; channelId: string }[] };
type Section = { props: { subtitle?: string } } | null;
const moduleExports = {} as {
  render: (
    search: Search,
    resolved: { query: string; filters: { modifier: string; label: string }[] },
    session: { canFetch: boolean; scopeSummary?: string },
    rows: Search["hits"],
    statusRow: unknown,
  ) => Section;
};
runInNewContext(compiled, {
  exports: moduleExports,
  countLabel,
  require: (name: string) => {
    assert.equal(name, "react/jsx-runtime");
    const jsx = (type: unknown, props: unknown) => ({ type, props });
    return { jsx, jsxs: jsx };
  },
});

const a = { key: "CA:1", channelId: "CA" };
const b = { key: "CB:2", channelId: "CB" };
function render(
  search: Search,
  query: string,
  statusRow?: unknown,
  scopeSummary?: string,
) {
  const rows: Search["hits"] = [];
  const section = moduleExports.render(
    search,
    { query, filters: [{ modifier: "in", label: query }] },
    { canFetch: true, scopeSummary },
    rows,
    statusRow,
  );
  return { rows, section };
}

test("Slack Compassは条件変更直後と取得待ちの間に前の条件のメッセージを表示しない", () => {
  const previous = { query: "alpha", hits: [a] };
  assert.deepEqual(render(previous, "alpha").rows, [a]);
  assert.deepEqual(render(previous, "bravo").rows, []);
  assert.equal(render(previous, "bravo").section, null);
  // 新条件の停止・失敗のお知らせが出ても、古い投稿をその下に残さない。
  assert.deepEqual(render(previous, "bravo", "status").rows, []);
  const current = render({ query: "bravo", hits: [b] }, "bravo");
  assert.deepEqual(current.rows, [b]);
  assert.equal(current.section?.props.subtitle, "in:bravo · 1 result");
});

test("Slack Compassは選んだ検索条件をMessagesの見出しの先頭に出し、一番上の画面のタイトルは変えない", () => {
  const search = { query: "bravo", hits: [b] };
  assert.equal(
    render(search, "bravo", undefined, "All / From: Me").section?.props
      .subtitle,
    "All / From: Me · in:bravo · 1 result",
  );
  // Store のルール：最初に開く画面（検索結果の List）の navigationTitle は設定しない
  const root = source.slice(
    source.indexOf("    <List\n      isLoading={"),
    source.indexOf("      searchBarAccessory="),
  );
  assert.ok(root.includes("searchBarPlaceholder="));
  assert.doesNotMatch(root, /navigationTitle/);
});

test("Slack Compassは同じ検索式の再取得中にはその検索結果を表示できる", () => {
  assert.deepEqual(render({ query: "alpha", hits: [a] }, "alpha").rows, [a]);
});

// 純粋関数のテストに加え、Slack Compassの描画順・操作・選択予約が同じモードを渡すことを実際のコールバックで検査する。
function orderHarness() {
  const ast = ts.createSourceFile(
    "compass-screen.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map<string, string>();
  let onApply = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer)
      declarations.set(node.name.getText(ast), node.initializer.getText(ast));
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(ast) === "onApply" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    )
      onApply = node.initializer.expression!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const key of ["order", "swapOrder", "changeSearchText"])
    assert.ok(declarations.has(key), key);
  assert.ok(onApply);
  type Request = { text: string; section: string };
  const context = {
    searchText: "",
    messageMode: false,
    override: undefined as unknown,
    candidates: [] as unknown[],
    hasTopSection: false,
    request: undefined as Request | undefined,
    ...orderFunctions,
    setSearchScope: () => {},
    setMessageMode: (value: boolean) => {
      context.messageMode = value;
    },
    setSearchText: (value: string) => {
      context.searchText = value;
    },
    setOverride: (value: unknown) => {
      context.override = value;
    },
    setRequest: (value: Request) => {
      context.request = value;
    },
    hasCandidatesFor: () => context.candidates.length > 0,
    exports: {} as {
      order: () => string[];
      swap: () => void;
      change: (text: string) => void;
      apply: (scope: object, options: { showMessages?: boolean }) => void;
    },
  };
  runInNewContext(
    ts.transpileModule(
      `export function order() { return ${declarations.get("order")}; }
    export const swap = ${declarations.get("swapOrder")};
    export const change = ${declarations.get("changeSearchText")};
    export const apply = ${onApply};`,
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    context,
  );
  return context;
}

test("Slack Compassのメッセージ表示操作は初期表示・双方向swap・文字変更・候補の表示順と先頭選択を整合させる", () => {
  const ui = orderHarness();
  ui.exports.apply({ range: { kind: "favorites" } }, { showMessages: true });
  const assertFirst = (
    section: "messages" | "conversations" | "candidates",
  ) => {
    assert.equal(ui.exports.order()[0], section);
    assert.equal(ui.request?.section, section);
    const selected = orderFunctions.decideSelection(
      ui.request as orderFunctions.SelectionRequest,
      {
        text: ui.searchText,
        query: "query",
        search: { query: "query", status: undefined },
        firstIds: {
          messages: "msg:1",
          conversations: "conv:1",
          candidates: "cand:1",
        },
      },
    );
    assert.equal(
      selected.selectedId,
      section === "messages"
        ? "msg:1"
        : section === "conversations"
          ? "conv:1"
          : "cand:1",
    );
  };
  assertFirst("messages");
  ui.exports.swap();
  assertFirst("conversations");
  ui.exports.change("請求");
  assertFirst("conversations");
  ui.exports.swap();
  assertFirst("messages");
  ui.candidates.push({});
  ui.hasTopSection = true;
  ui.exports.swap();
  assertFirst("candidates");
  ui.exports.swap();
  assertFirst("candidates");
});

// setterは次の描画値だけを更新し、Actionが捕捉した古い描画値は保持する。
function channelEntryHarness(
  searchText: string,
  messageMode: boolean,
  override: orderFunctions.OrderedSection | undefined,
  scope: object = { range: { kind: "all" } },
) {
  const ast = ts.createSourceFile(
    "compass-screen.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let change = "";
  let entry = "";
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(ast) === "changeSearchText"
    )
      change = node.initializer!.getText(ast);
    if (ts.isJsxSelfClosingElement(node)) {
      const title = node.attributes.properties.find(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(ast) === "title",
      );
      if (
        title &&
        ts.isJsxAttribute(title) &&
        title.initializer &&
        ts.isStringLiteral(title.initializer) &&
        title.initializer.text === "Search Messages in This Channel"
      ) {
        const action = node.attributes.properties.find(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(ast) === "onAction",
        ) as ts.JsxAttribute;
        entry = (action.initializer as ts.JsxExpression).expression!.getText(
          ast,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(change);
  assert.ok(entry);
  const next = {
    searchText,
    messageMode,
    override,
    scope,
    request: undefined as orderFunctions.SelectionRequest | undefined,
  };
  const exports: { create?: (state: object) => () => void } = {};
  runInNewContext(
    ts.transpileModule(
      `export function create({searchText, messageMode, override, searchScope}) {
    const changeSearchText = ${change};
    return ${entry};
  }`,
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports,
      ...orderFunctions,
      scopeForChannel: compassScope.scopeForChannel,
      item: { id: "C1" },
      setSearchScope: (scope: typeof next.scope) => {
        next.scope = scope;
      },
      setSearchText: (text: string) => {
        next.searchText = text;
      },
      setMessageMode: (mode: boolean) => {
        next.messageMode = mode;
      },
      setOverride: (value: typeof override) => {
        next.override = value;
      },
      setRequest: (request: orderFunctions.SelectionRequest) => {
        next.request = request;
      },
      hasCandidatesFor: () => false,
    },
  );
  return {
    next,
    action: exports.create!({
      searchText,
      messageMode,
      override,
      searchScope: next.scope,
    }),
  };
}

for (const messageMode of [false, true]) {
  test(`チャンネルのメッセージ検索入口は旧messageMode=${messageMode}・会話優先からメッセージ優先と先頭選択へ切り替える`, () => {
    const ui = channelEntryHarness("請求", messageMode, "conversations");
    ui.action();
    assert.equal(ui.next.messageMode, true);
    assert.equal(ui.next.searchText, "");
    assert.equal(
      orderFunctions.sectionOrder(
        ui.next.searchText,
        ui.next.override,
        false,
        ui.next.messageMode,
      )[0],
      "messages",
    );
    assert.equal(ui.next.request?.section, "messages");
    assert.equal(
      orderFunctions.decideSelection(ui.next.request, {
        text: "",
        query: "query",
        search: { query: "query", status: undefined },
        firstIds: {
          messages: "msg:1",
          conversations: "conv:1",
          triage: "tome:1",
        },
      }).selectedId,
      "msg:1",
    );
  });
}

// 条件を1つずつ外す Action。Slack Compass の実際の宣言を取り出して動かし、検索語が残ることを確かめる。
function removeHarness(
  searchScope: object,
  searchText: string,
  messageMode = false,
) {
  const ast = ts.createSourceFile(
    "compass-screen.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer)
      declarations.set(node.name.getText(ast), node.initializer.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const key of ["removeFilter", "removable", "removeActions"])
    assert.ok(declarations.has(key), key);
  const calls = {
    scopes: [] as unknown[],
    texts: [] as string[],
    modes: [] as boolean[],
    overrides: [] as unknown[],
    requests: [] as { text: string; section: string }[],
  };
  const exports: {
    build?: () => { props: { title: string; onAction: () => void } }[];
  } = {};
  runInNewContext(
    ts.transpileModule(
      `export function build() {
    const removeFilter = ${declarations.get("removeFilter")};
    const removable = ${declarations.get("removable")};
    return ${declarations.get("removeActions")};
  }`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports,
      require: (name: string) => {
        assert.equal(name, "react/jsx-runtime");
        const jsx = (type: unknown, props: unknown) => ({ type, props });
        return { jsx, jsxs: jsx };
      },
      ...orderFunctions,
      Action: "Action",
      Icon: { XMarkCircle: "x-mark-circle" },
      removableFilters: compassScope.removableFilters,
      removeScopeFilter: compassScope.removeScopeFilter,
      searchScope,
      searchText,
      messageMode,
      candidates: [],
      setMessageMode: (mode: boolean) => calls.modes.push(mode),
      setSearchScope: (scope: unknown) => calls.scopes.push(scope),
      setSearchText: (text: string) => calls.texts.push(text),
      setOverride: (value: unknown) => calls.overrides.push(value),
      setRequest: (request: { text: string; section: string }) =>
        calls.requests.push(request),
    },
  );
  return {
    calls,
    // vm の中で作られた配列は prototype が違うので、この側の配列に詰め直す
    actions: () => [
      ...exports.build!()
        .filter(Boolean)
        .map((action) => action.props),
    ],
  };
}

test("条件を外すActionは、指定中の条件の分だけ出る", () => {
  const titles = (scope: object) =>
    removeHarness(scope, "請求")
      .actions()
      .map((action) => action.title);
  assert.deepEqual(titles({ range: { kind: "all" } }), []);
  assert.deepEqual(titles({ range: { kind: "favorites" } }), [
    "Remove Scope Filter",
  ]);
  assert.deepEqual(titles({ range: { kind: "all" }, senderId: "U2" }), [
    "Remove Sender Filter",
  ]);
  assert.deepEqual(
    titles({ range: { kind: "all" }, recipient: { kind: "me" } }),
    ["Remove Recipient Filter"],
  );
  assert.deepEqual(
    titles({
      range: { kind: "dm", userId: "U2" },
      senderId: "U1",
      recipient: { kind: "me" },
    }),
    ["Remove Scope Filter", "Remove Sender Filter", "Remove Recipient Filter"],
  );
});

test("条件を外すActionは、その条件だけを外し、検索語も残りの条件も保つ", () => {
  const scope = {
    range: { kind: "channel", channelId: "C1" },
    senderId: "U2",
    recipient: { kind: "me" },
  };
  const expected: Record<string, object> = {
    "Remove Scope Filter": {
      range: { kind: "all" },
      senderId: "U2",
      recipient: { kind: "me" },
    },
    "Remove Sender Filter": {
      range: { kind: "channel", channelId: "C1" },
      recipient: { kind: "me" },
    },
    "Remove Recipient Filter": {
      range: { kind: "channel", channelId: "C1" },
      senderId: "U2",
    },
  };
  for (const [title, next] of Object.entries(expected)) {
    const ui = removeHarness(scope, "請求");
    ui.actions()
      .find((action) => action.title === title)!
      .onAction();
    assert.deepEqual(
      JSON.parse(JSON.stringify(ui.calls.scopes)),
      [next],
      title,
    );
    // 検索語は書き換えない
    assert.deepEqual(ui.calls.texts, [], title);
    assert.deepEqual(ui.calls.overrides, [undefined], title);
    assert.equal(ui.calls.requests.length, 1, title);
    assert.equal(ui.calls.requests[0].text, "請求", title);
  }
});

test("条件を外すActionと条件の選択画面は、検索結果の行・会話の行・空の状態・競合の行のすべてで使える", () => {
  const ast = ts.createSourceFile(
    "compass-screen.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map<string, string>();
  const titles: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer)
      declarations.set(node.name.getText(ast), node.initializer.getText(ast));
    if (ts.isJsxSelfClosingElement(node)) {
      for (const attribute of node.attributes.properties)
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(ast) === "title" &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer)
        )
          titles.push(attribute.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const title of [
    // サブ画面を開く Action には末尾に … を付ける
    "Choose Search Filters…",
    "Remove Scope Filter",
    "Remove Sender Filter",
    "Remove Recipient Filter",
  ])
    assert.ok(titles.includes(title), title);
  assert.ok(!titles.includes("Choose Search Filters"));
  // 会話・メッセージ・失敗の行が使う共通操作と、空の状態・検索の停止の行が使う操作の両方に入る
  assert.match(declarations.get("commonActions")!, /\.\.\.removeActions/);
  assert.match(
    declarations.get("standaloneWithDetails")!,
    /\.\.\.removeActions/,
  );
  assert.match(source, /\{scopeAction\}\s*\{removeActions\}/);
  assert.match(
    source,
    /\{scopeAction\}\s*\{removeActions\}[\s\S]*Reload from Beginning/,
  );
  assert.match(
    source,
    /actions=\{<ActionPanel>\{standaloneWithDetails\("empty"\)\}<\/ActionPanel>\}/,
  );
});

test("条件を外して条件が1つも残らないときだけ、メッセージ表示の指定を解く", () => {
  const remove = (scope: object, title: string) => {
    const ui = removeHarness(scope, "", true);
    ui.actions()
      .find((action) => action.title === title)!
      .onAction();
    return { modes: [...ui.calls.modes], request: ui.calls.requests[0] };
  };
  // 最後の条件を外す：会話の一覧に戻る（Clear Filters and Apply と同じ）
  const last = remove(
    { range: { kind: "all" }, senderId: "U2" },
    "Remove Sender Filter",
  );
  assert.deepEqual(last.modes, [false]);
  assert.notEqual(last.request.section, "messages");
  // 条件が残るなら、メッセージ表示のまま
  const rest = remove(
    { range: { kind: "favorites" }, senderId: "U2" },
    "Remove Sender Filter",
  );
  assert.deepEqual(rest.modes, [true]);
  assert.equal(rest.request.section, "messages");
});

test("チャンネルのメッセージ検索入口は、人宛てだけを外して送信者と自分宛てを持ち越す", () => {
  const run = (scope: object) => {
    const ui = channelEntryHarness("", false, undefined, scope);
    ui.action();
    return JSON.parse(JSON.stringify(ui.next.scope));
  };
  const channel = { kind: "channel", channelId: "C1" };
  assert.deepEqual(
    run({
      range: { kind: "all" },
      senderId: "U2",
      recipient: { kind: "person", userId: "U3" },
    }),
    { range: channel, senderId: "U2" },
  );
  assert.deepEqual(
    run({ range: { kind: "all" }, senderId: "U2", recipient: { kind: "me" } }),
    { range: channel, senderId: "U2", recipient: { kind: "me" } },
  );
});
