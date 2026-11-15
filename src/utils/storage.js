/**
 * 保存在浏览器 localStorage 里的数据：原始文本（论文全文）、封面信息、格式和编号设置。
 * 纯函数，storage 作为参数传入，方便在 node 里测试。
 */

export const STORAGE_KEYS = {
  input: "paper_cleaner_input",
  cover: "paper_cleaner_cover",
  style: "paper_cleaner_style",
  numbering: "paper_cleaner_numbering",
};

/** 删除本工具保存的所有数据，返回是否成功。隐私模式或禁止存储时返回 false，不抛错。 */
export function clearSaved(storage = globalThis.localStorage) {
  try {
    if (!storage) return false;
    for (const key of Object.values(STORAGE_KEYS)) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
