/**
 * 上传文件转文本的纯函数：PDF 文本项拼行、PDF 硬换行重排。
 * 不依赖浏览器，可以直接用 node --test 测试。
 */
import { normalizeText } from "./cleaner.js";

/** pdf.js 的文本项拼成多行文本：有 hasEOL 按它换行，没有就看 y 坐标是否变化。 */
export function pdfItemsToText(items) {
  let text = "";
  let prevY = null;
  for (const item of items || []) {
    if (!item || typeof item.str !== "string") continue;
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    const hasEol = typeof item.hasEOL === "boolean";
    if (!hasEol && prevY !== null && y !== null && Math.abs(y - prevY) > 1 && text && !text.endsWith("\n")) {
      text += "\n";
    }
    text += item.str;
    if (hasEol && item.hasEOL) text += "\n";
    if (y !== null) prevY = y;
  }
  return text.replace(/[ \t]+$/gm, "").trim();
}

// 一定是页码的行：- 12 -、第 12 页、Page 12
const PAGE_NUMBER = [
  /^[-–—－]\s*\d{1,4}\s*[-–—－]$/,
  /^第\s*\d{1,4}\s*页(\s*[,，/／]?\s*共\s*\d{1,4}\s*页)?$/,
  /^page\s+\d{1,4}(\s+of\s+\d{1,4})?$/i,
];
// 只有出现在页首或页尾才当页码：12、xii、3 / 20（页面中间可能是表格数据）
const PAGE_NUMBER_AT_EDGE = [/^\d{1,4}$/, /^[ivxlc]{1,6}$/i, /^\d{1,4}\s*[/／]\s*\d{1,4}$/];

const isPageNumber = (line) => PAGE_NUMBER.some((re) => re.test(line));
const isEdgePageNumber = (line) => isPageNumber(line) || PAGE_NUMBER_AT_EDGE.some((re) => re.test(line));

/** 按换页符拆页，去掉页首页尾的页码行和每页首尾的空行。 */
function pageLines(text) {
  const out = [];
  for (const page of String(text || "").replace(/\r\n?/g, "\n").split("\f")) {
    const lines = page.split("\n").map((line) => line.trim());
    while (lines.length && (lines[0] === "" || isEdgePageNumber(lines[0]))) lines.shift();
    while (lines.length && (lines[lines.length - 1] === "" || isEdgePageNumber(lines[lines.length - 1]))) lines.pop();
    out.push(...lines.filter((line) => !isPageNumber(line)));
  }
  return out;
}

const SENTENCE_END = /[。！？；：.!?;:]$/;
const LIST_LINE = /^([-•·*+]\s|\d+[、)）]|\d+[.．](?!\d)|[（(]\d+[）)])/;
const NUMBER_ONLY = /^[\d.,%‰\s-]+$/;
// 中文字符和全角标点
const isCjk = (ch) => {
  const c = ch ? ch.codePointAt(0) : 0;
  return (c >= 0x3000 && c <= 0x303f) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef);
};

/** 识别规则认为它是结构行（标题、摘要、关键词、参考文献、表格、图表题、公式等）。 */
function lineTag(line) {
  const tag = normalizeText(line).match(/^\[([A-Z][A-Z0-9_]*)\]/);
  return tag ? tag[1] : null;
}

function isStandalone(line) {
  return LIST_LINE.test(line) || NUMBER_ONLY.test(line) || lineTag(line) !== null;
}

/** 上一行能不能接下一行：列表项和参考文献条目常被折行，可以接；其他结构行不接。 */
function canContinue(line) {
  if (SENTENCE_END.test(line) || NUMBER_ONLY.test(line)) return false;
  const tag = lineTag(line);
  return tag === null || tag === "REF";
}

function joinLines(prev, next) {
  if (/[A-Za-z]-$/.test(prev) && /^[a-z]/.test(next)) return prev.slice(0, -1) + next;
  if (isCjk(prev.slice(-1)) || isCjk(next[0])) return prev + next;
  return `${prev} ${next}`;
}

/**
 * 只用于 PDF 来源：合并硬换行，删除页码行。
 * 页之间用换页符 \f 分隔；空行当作段落分隔，不跨空行合并。
 */
export function reflowLines(text) {
  const out = [];
  for (const line of pageLines(text)) {
    const last = out.length ? out[out.length - 1] : "";
    if (line === "") {
      if (last !== "") out.push("");
      continue;
    }
    if (last !== "" && canContinue(last) && !isStandalone(line)) {
      out[out.length - 1] = joinLines(last, line);
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}
