import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Raycast は US English だけに対応するので、画面に出る文字列へ日本語と全角記号を入れない。
const NON_ENGLISH = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;

// 入力の解析にだけ使い、画面には出ない全角記号。日本語入力の区切りやコロンを受け付けるために残す。
const ALLOWED: ReadonlyArray<{ file: string; text: string; reason: string }> = [
  {
    file: "src/slack/identity.ts",
    text: "/[,，、]/",
    reason: "Previous Handles の区切りに全角カンマ・読点を受け付ける",
  },
  {
    file: "src/features/preferences/edit-item.tsx",
    text: "/[,、]/",
    reason: "別名の区切りに読点を受け付ける",
  },
  {
    file: "src/slack/mrkdwn.ts",
    text: "(^|\\s)\\*\\*(?=\\s|$|[.,!?、。])",
    reason: "日本語の句読点の前で太字の終わりを判定する",
  },
  {
    file: "src/slack/mrkdwn.ts",
    text: "(^|\\s)~~(?=\\s|$|[.,!?、。])",
    reason: "日本語の句読点の前で打ち消し線の終わりを判定する",
  },
  {
    file: "src/features/compose/md-to-blocks.ts",
    text: "　",
    reason: "全角スペースを空白として扱う",
  },
  {
    file: "src/features/search/query.ts",
    text: "/^(-?)(from|to|in)[:：](.*)$/i",
    reason: "検索欄の全角コロンを受け付ける",
  },
  {
    file: "src/features/search/query.ts",
    text: "/^-?(after|before|on|during|has|is|with)[:：]/i",
    reason: "検索欄の全角コロンを受け付ける",
  },
  {
    file: "src/features/search/query.ts",
    text: "：",
    reason: "検索欄の全角コロンを半角に読み替える",
  },
];

// ソースの文字列・テンプレート・JSX のテキストから、英語以外の文字を含むものを返す。
export function findNonEnglish(
  file: string,
  code: string,
): { line: number; text: string }[] {
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: { line: number; text: string }[] = [];
  function visit(node: ts.Node) {
    let text: string | undefined;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node)
    )
      text = node.text;
    else if (ts.isRegularExpressionLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node))
      text =
        node.head.text +
        node.templateSpans.map((span) => span.literal.text).join("");
    if (text !== undefined && NON_ENGLISH.test(text))
      found.push({
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        text,
      });
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

test("画面に出る文字列に日本語と全角記号がない", () => {
  const files = readdirSync("src", { recursive: true })
    .map((file) => `src/${file}`)
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) && !/\.(test|fixtures)\.ts$/.test(file),
    );
  const unexpected = files.flatMap((file) =>
    findNonEnglish(file, readFileSync(file, "utf8"))
      .filter(
        ({ text }) =>
          !ALLOWED.some((entry) => entry.file === file && entry.text === text),
      )
      .map(({ line, text }) => `${file}:${line}: ${text}`),
  );
  assert.deepEqual(unexpected, []);
});

test("許可リストの各項目が今のソースに実在する", () => {
  for (const entry of ALLOWED)
    assert.ok(
      findNonEnglish(entry.file, readFileSync(entry.file, "utf8")).some(
        ({ text }) => text === entry.text,
      ),
      `${entry.file}: ${entry.text}`,
    );
});

test("検査は文字列・テンプレート・JSX の日本語と全角記号を見つける", () => {
  const code = [
    'const a = "送信しました";',
    "const b = `${a}（下書き）`;",
    "const c = <Text>保存</Text>;",
    'const d = "Sent";',
  ].join("\n");
  assert.deepEqual(
    findNonEnglish("sample.tsx", code).map(({ line }) => line),
    [1, 2, 3],
  );
});
