import assert from "node:assert/strict";
import { test } from "node:test";
import { countLabel } from "./plural.ts";

test("件数が1のときだけ単数形にし、0と2以上は複数形にする", () => {
  assert.equal(countLabel(1, "result"), "1 result");
  assert.equal(countLabel(2, "result"), "2 results");
  assert.equal(countLabel(0, "result"), "0 results");
  assert.equal(countLabel(1, "search", "searches"), "1 search");
  assert.equal(countLabel(3, "search", "searches"), "3 searches");
});
