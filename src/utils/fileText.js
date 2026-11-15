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

/** 反复去掉页首页尾满足条件的行。 */
function trimEdges(lines, isJunk) {
  while (lines.length && isJunk(lines[0])) lines.shift();
  while (lines.length && isJunk(lines[lines.length - 1])) lines.pop();
  return lines;
}

// 页眉页脚按「数字忽略」比较：每页的页码不同也算同一行
const edgeKey = (line) => line.replace(/\d+/g, "#");

/** 至少 3 页、并且一半以上页面的首行或末行相同，才当页眉页脚。 */
function runningLines(pages) {
  if (pages.length < 3) return new Set();
  const counts = new Map();
  for (const lines of pages) {
    const edges = new Set([lines[0], lines[lines.length - 1]].filter(Boolean).map(edgeKey));
    for (const key of edges) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= 3 && n >= pages.length / 2).map(([key]) => key));
}

/** 按换页符拆页，去掉页首页尾的页码、重复的页眉页脚和空行。 */
function pageLines(text) {
  const blankOrNumber = (line) => line === "" || isEdgePageNumber(line);
  const pages = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\f")
    .map((page) => trimEdges(page.split("\n").map((line) => line.trim()), blankOrNumber));
  const running = runningLines(pages);
  const out = [];
  for (const lines of pages) {
    trimEdges(lines, (line) => blankOrNumber(line) || running.has(edgeKey(line)));
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

/* ---------- .docx：mammoth.convertToHtml 的输出转文本 ---------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? match;
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

const cellText = (text) => text.replace(/\s+/g, " ").trim().replace(/\|/g, "｜");

function markdownTable(rows) {
  if (!rows.length) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)];
}

/**
 * mammoth 输出的 HTML 转成文本：h1/h2/h3 转 # / ## / ###，li 转「- 」或「1. 」，
 * 表格转 Markdown 表格，其余标签去掉只留文字。之后走正常的识别流程。
 */
export function docxHtmlToText(html) {
  const lines = [];
  const lists = [];
  let current = "";
  let prefix = "";
  let table = null;

  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) {
      lines.push(prefix + text);
      prefix = "";
    }
    current = "";
  };
  const append = (text) => {
    if (table?.cell != null) table.cell += text;
    else current += text;
  };

  for (const [, tag, text] of String(html || "").matchAll(/(<[^>]*>)|([^<]+)/g)) {
    if (text !== undefined) {
      append(decodeEntities(text));
      continue;
    }
    const m = tag.match(/^<(\/?)([a-z][a-z0-9]*)/i);
    if (!m) continue;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();

    if (name === "table") {
      flush();
      if (closing && table) lines.push(...markdownTable(table.rows));
      table = closing ? null : { rows: [], row: [], cell: null };
      continue;
    }
    if (table) {
      // 表格里：tr 换行，td/th 是单元格，单元格里的多个段落用空格连起来
      if (name === "tr") {
        if (closing && table.row.length) table.rows.push(table.row);
        table.row = [];
      } else if (name === "td" || name === "th") {
        if (closing) table.row.push(cellText(table.cell ?? ""));
        table.cell = closing ? null : "";
      } else if (name === "p" || name === "br") {
        append(" ");
      }
      continue;
    }

    if (/^h[1-6]$/.test(name)) {
      flush();
      const level = Number(name[1]);
      prefix = !closing && level <= 3 ? `${"#".repeat(level)} ` : "";
    } else if (name === "ul" || name === "ol") {
      flush();
      if (closing) lists.pop();
      else lists.push({ ordered: name === "ol", n: 0 });
    } else if (name === "li") {
      flush();
      const list = lists[lists.length - 1];
      prefix = closing ? "" : list?.ordered ? `${++list.n}. ` : "- ";
    } else if (name === "p" || name === "br") {
      flush();
    }
  }
  flush();
  return lines.join("\n");
}
