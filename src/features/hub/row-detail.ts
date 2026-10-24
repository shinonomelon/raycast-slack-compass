import type { Row } from "../../slack/items.ts";
import type { Person } from "../../shared/types.ts";
// 取得済みの値を本文として表示する。改行とMarkdown記号で別の見出し・リンクを作らせない。
export function escapeDetail(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/[\\`*_{}[\]()#+.!<>|~-]/g, "\\$&");
}
const kinds = {
  get channel() {
    return "Public Channel";
  },
  get private() {
    return "Private Channel";
  },
  get group() {
    return "Group DM";
  },
  get person() {
    return "Person";
  },
};
export function rowDetail(row: Row, person?: Person): string {
  const fields: [string, string][] = [
    ["Type", kinds[row.kind]],
    ...(person?.handle
      ? [["Handle", `@${person.handle}`] as [string, string]]
      : []),
    ...(person?.realName
      ? [["Real Name", person.realName] as [string, string]]
      : []),
    ...(person?.title ? [["Job Title", person.title] as [string, string]] : []),
    ...(row.aliases.length
      ? [["Aliases", row.aliases.join(", ")] as [string, string]]
      : []),
    ["ID", row.id],
  ];
  return `## ${escapeDetail(row.title)}\n\n${fields.map(([name, value]) => `**${name}**: ${escapeDetail(value)}`).join("\n\n")}`;
}
