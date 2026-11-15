import { test } from "node:test";
import assert from "node:assert/strict";
import { clearSaved, STORAGE_KEYS } from "../src/utils/storage.js";

function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return { map, removeItem: (key) => map.delete(key) };
}

test("一键清除本地数据：删掉论文全文、封面、格式和编号设置，不动其他网站数据", () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.input]: "论文全文",
    [STORAGE_KEYS.cover]: "{}",
    [STORAGE_KEYS.style]: "{}",
    [STORAGE_KEYS.numbering]: "cn",
    other_app: "保留",
  });
  assert.equal(clearSaved(storage), true);
  assert.deepEqual([...storage.map.keys()], ["other_app"]);
});

test("浏览器禁止访问存储时清除不报错", () => {
  const storage = { removeItem: () => { throw new Error("SecurityError"); } };
  assert.equal(clearSaved(storage), false);
  assert.equal(clearSaved(undefined), false);
});
