// 件数と名詞をつなぐ。1 のときだけ単数形にする（表示は英語だけなので、英語の規則で足りる）
export function countLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
