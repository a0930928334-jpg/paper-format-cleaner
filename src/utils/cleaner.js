/**
 * AI 论文格式清洗：把原始文本转换成带结构标签的中间文本
 *
 * 目标：
 * 1. 将原始 AI 文本转换成稳定的中间结构标签
 * 2. 支持封面信息、摘要、英文摘要、关键词、正文标题、参考文献
 * 3. 支持基础表格、图题、表题、公式行识别
 * 4. 标题只保留纯标题，编号交给 Word 导出阶段统一生成
 */

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CN = "一二三四五六七八九十百";

function stripHeadingNumber(text) {
  return String(text || "")
    .trim()
    .replace(/^第\s*[\d一二三四五六七八九十百]+\s*[章节]\s*/, "")
    .replace(new RegExp(`^[${CN}]+[、.．]\\s*`), "")
    .replace(new RegExp(`^[${CN}]+\\s+(?=[^\\s])`), "")
    .replace(/^[（(][一二三四五六七八九十\d]+[）)]\s*/, "")
    .replace(/^\d+(\.\d+)+\s+/, "")
    .trim();
}

export function isMarkdownTableLine(line) {
  const t = line.trim();
  return /^\|.+\|$/.test(t);
}

export function isMarkdownTableSeparator(line) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

/**
 * 去掉一行里的行内 Markdown，只保留文字。
 * 斜体要求星号 / 下划线外侧不紧挨字母数字、内侧不是空格，避免误伤 a*b*c、y = a * b、snake_case；
 * 加粗只要求开头外侧不紧挨字母数字，避免误伤 x**2。
 */
export function stripInlineMarkdown(line) {
  let t = String(line ?? "");
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(t)) return ""; // 分隔线 --- *** ___
  if (/^\s*```/.test(t)) return ""; // 代码块围栏
  const isTableRow = /^\s*\|.*\|\s*$/.test(t);
  t = t.replace(/<br\s*\/?>/gi, isTableRow ? " " : "\n");
  t = t.replace(/^(\s*)>(?:\s+|$)/, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.|mailto:|#|\/)[^)\s]*\)/g, "$1");
  t = t.replace(/`([^`\n]+)`/g, "$1");
  t = t.replace(/~~([^\s~](?:[^~]*[^\s~])?)~~/g, "$1");
  t = t.replace(/(^|[^A-Za-z0-9*])\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/g, "$1$2");
  t = t.replace(/(^|[^A-Za-z0-9_])__([^\s_](?:[^_]*[^\s_])?)__/g, "$1$2");
  t = t.replace(/(^|[^A-Za-z0-9*])\*([^\s*](?:[^*]*[^\s*])?)\*(?![A-Za-z0-9*])/g, "$1$2");
  t = t.replace(/(^|[^A-Za-z0-9_])_([^\s_](?:[^_]*[^\s_])?)_(?![A-Za-z0-9_])/g, "$1$2");
  return t;
}

/** 去掉标题外面的包装：行首 #、首尾 ** / __ / 【】、行尾冒号和多余空格。 */
export function bareHeading(line) {
  let t = String(line || "").trim().replace(/^#{1,6}\s*/, "");
  for (let i = 0; i < 2; i++) {
    t = t.replace(/[:：]\s*$/, "").trim();
    t = t.replace(/^(\*\*|__)(.+)\1$/, "$2").trim();
    t = t.replace(/^【(.+)】$/, "$1").trim();
  }
  return t.replace(/\s+/g, " ");
}

const SECTION_PATTERNS = [
  ["abstract", /^(中文)?摘\s*要$/],
  ["abstractEn", /^abstract$/i],
  ["references", /^(参\s*考\s*文\s*献|references|bibliography)$/i],
  ["acknowledgements", /^(致\s*谢|acknowledge?ments?)$/i],
  // 附录可以带编号和短标题：附录A 调查问卷、Appendix A: Questionnaire
  ["appendix", /^(附\s*录|appendix)(\s*([A-Z]|\d{1,2}|[一二三四五六七八九十]{1,2}))?([\s:：.、．]+[^。，；！？,.;!?]{1,30})?$/i],
];

/**
 * 判断一行是不是特殊章节名。normalizeText 和 applyInputFallbacks 共用，保证两边规则一致。
 * 返回 abstract | abstractEn | references | acknowledgements | appendix | null
 */
export function sectionKeyword(line) {
  const bare = bareHeading(line);
  if (!bare || bare.length > 40) return null;
  const hit = SECTION_PATTERNS.find(([, re]) => re.test(bare));
  return hit ? hit[0] : null;
}

// 行内摘要：只有冒号（或【】）后面有内容才拆分，「摘要生成算法是……」这种正文不受影响
const INLINE_SECTIONS = [
  ["abstract", /^(?:【\s*(?:中文)?摘\s*要\s*】\s*|(?:中文)?摘\s*要\s*[:：]\s*)(\S.*)$/],
  ["abstractEn", /^(?:【\s*abstract\s*】\s*|abstract\s*[:：]\s*)(\S.*)$/i],
];

/** 「摘要：本文……」「Abstract: This paper …」：返回 { kind, text }，否则 null。 */
export function inlineSection(line) {
  const t = String(line || "").replace(/\*\*|__/g, "").trim();
  for (const [kind, re] of INLINE_SECTIONS) {
    const m = t.match(re);
    if (m) return { kind, text: m[1].trim() };
  }
  return null;
}

// 关键词后面必须紧跟冒号，或者整行就是这个词；「关键词提取是……」是正文
const KEYWORDS_CN = /^(?:【\s*关\s*键\s*词\s*】|关\s*键\s*词\s*(?:[:：]|$))\s*(.*)$/;
const KEYWORDS_EN = /^key\s*words?\s*(?:[:：]|$)\s*(.*)$/i;

/** 关键词行：返回 { lang: "cn" | "en", text }，不是关键词行返回 null。 */
export function keywordsOf(line) {
  const t = String(line || "").replace(/\*\*|__/g, "").trim();
  const cn = t.match(KEYWORDS_CN);
  if (cn) return { lang: "cn", text: cn[1].trim() };
  const en = t.match(KEYWORDS_EN);
  if (en) return { lang: "en", text: en[1].trim() };
  return null;
}

const REF_TYPE = /\[(?:J|M|C|D|R|S|P|N|Z|EB)(?:\/OL)?\]/;
const YEAR = /(^|\D)(1[5-9]|20)\d{2}(\D|$)/;

/** 参考文献区之外的 [n] 行：带文献类型标识，或者 ] 后有空格且有四位年份，才算参考文献。 */
function looksLikeReference(line) {
  if (!/^\[\d+\]/.test(line)) return false;
  return REF_TYPE.test(line) || (/^\[\d+\]\s/.test(line) && YEAR.test(line));
}

/** 图表题：图1 / 表 3-2 / 表1.2 开头，不超过 40 字，没有句读符号。返回标签名或 null。 */
function captionOf(line) {
  const m = line.match(/^(图|表)\s*\d+(?:[.\-－]\d+)*/);
  if (!m || line.length > 40 || /[。，；！？]/.test(line)) return null;
  return m[1] === "表" ? "TABLE_CAPTION" : "FIGURE_CAPTION";
}

/** 等号行像公式：短、没有句读、中文少、英文长单词不超过 3 个、不以英文句号结尾。 */
function looksLikeEquation(line, cjkCount) {
  const words = (line.match(/[A-Za-z]{3,}/g) || []).length;
  return /=/.test(line) && line.length <= 90 && !/[。！？，；]/.test(line) && cjkCount <= 10 && words <= 3 && !/\.$/.test(line);
}

// 列表项：1、 1) 1） 1. 1．（点后面不能紧跟数字，排除 3.5 这种小数）
const LIST_ITEM = /^(\d+)(?:[、)）]|[.．](?!\d))\s*(\S.*)$/;

/** 列表项统一成论文常用序号：cn 方案用（1），arabic 方案用 (1)。不是列表项返回 null。 */
export function listItemText(line, scheme = "cn") {
  const m = String(line || "").trim().match(LIST_ITEM);
  if (!m) return null;
  return scheme === "arabic" ? `(${m[1]}) ${m[2]}` : `（${m[1]}）${m[2]}`;
}

// 带编号的二、三级标题要像标题：不太长、没有句末标点（排除「3.5 倍的效率……。」「2024.5 月份」）
const shortTitle = (t) => t.length <= 40 && !/[。！？；]/.test(t);

/** 按编号判断标题级别，没有编号返回 null。 */
function numberedLevel(t) {
  if (/^\d{1,2}\.\d{1,2}\.\d{1,2}\s+\S/.test(t) && shortTitle(t)) return 3;
  if ((/^[（(][一二三四五六七八九十\d]+[）)]\s*\S/.test(t) || /^\d{1,2}\.\d{1,2}\s+\S/.test(t)) && shortTitle(t)) return 2;
  if (
    /^第\s*[\d一二三四五六七八九十百]+\s*[章节]\s+\S/.test(t) ||
    new RegExp(`^[${CN}]+[、.．]\\s*\\S`).test(t) ||
    new RegExp(`^[${CN}]+\\s+[^\\d\\s]`).test(t)
  ) {
    return 1;
  }
  return null;
}

// Markdown 标题里的「1. 引言」「1 引言」：行首有 # 已经确定是标题，按一级标题处理
const MD_CHAPTER = /^\d{1,2}(?:[.．、]\s*|\s+)(?=[^\d\s])/;

/** 题目单独占了 #、章节都从 ## 开始时，把 Markdown 标题整体提升，最高一级对应一级标题。 */
function markdownShift(lines) {
  let min = 7;
  for (const line of lines) {
    const md = line.trim().match(/^(#{1,6})\s+\S/);
    if (md && !sectionKeyword(line)) min = Math.min(min, md[1].length);
  }
  return min <= 6 ? min - 1 : 0;
}

/** 识别标题，返回 { level, text }，不是标题返回 null。编号优先于 # 的个数。 */
function headingOf(line, shift) {
  const md = line.match(/^(#{1,6})\s+(.+)$/);
  const t = md ? md[2].trim() : line;
  const level = numberedLevel(t);
  if (level) return { level, text: stripHeadingNumber(t) };
  if (!md) return null;
  if (MD_CHAPTER.test(t)) return { level: 1, text: t.replace(MD_CHAPTER, "").trim() };
  return { level: Math.min(3, Math.max(1, md[1].length - shift)), text: t };
}

export function normalizeText(input) {
  let text = input || "";

  text = text.replace(/\r\n?/g, "\n");
  text = text.split("\n").map(stripInlineMarkdown).join("\n");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/\u3000/g, " ");
  text = text.replace(/^(#{1,6})([^#\s])/gm, "$1 $2");
  text = text.replace(/^[•·]\s*/gm, "- ");
  text = text.replace(/^[*+]\s+/gm, "- ");
  text = text.replace(/^(\d+)[)）]\s*/gm, "$1. ");

  const lines = text.split("\n");
  const out = [];
  const shift = markdownShift(lines);

  const META_KEYS =
    /^(学校|院校|论文题目|题目|英文题目|英文标题|专业|班级|学号|姓名|日期)[:：]/;

  let inReferences = false;
  let h2Seen = false; // 当前一级标题下是否已有二级标题

  for (const rawLine of lines) {
    const trim = rawLine.trim();

    if (trim === "") {
      out.push("");
      continue;
    }

    if (META_KEYS.test(trim)) {
      out.push(`[META] ${trim}`);
      continue;
    }

    const section = sectionKeyword(trim);

    if (section === "abstract") {
      inReferences = false;
      out.push("[ABSTRACT]");
      continue;
    }

    if (section === "abstractEn") {
      inReferences = false;
      out.push("[ABSTRACT_EN]");
      continue;
    }

    if (section === "acknowledgements") {
      inReferences = false;
      out.push("[ACKNOWLEDGEMENTS]");
      continue;
    }

    if (section === "appendix") {
      inReferences = false;
      out.push(`[APPENDIX] ${bareHeading(trim)}`);
      continue;
    }

    const inline = inlineSection(trim);
    if (inline) {
      inReferences = false;
      out.push(inline.kind === "abstractEn" ? "[ABSTRACT_EN]" : "[ABSTRACT]", inline.text);
      continue;
    }

    const keywords = keywordsOf(trim);
    if (keywords) {
      out.push(`${keywords.lang === "en" ? "[KEYWORDS_EN]" : "[KEYWORDS]"} ${keywords.text}`);
      continue;
    }

    if (section === "references") {
      inReferences = true;
      out.push("[REFERENCES]");
      continue;
    }

    if (inReferences) {
      // 遇到一级标题，参考文献区结束
      const heading = headingOf(trim, shift);
      if (heading?.level === 1) {
        inReferences = false;
        h2Seen = false;
        out.push(`[H1] ${heading.text}`);
        continue;
      }
      const content = trim.replace(/^\[\d+\]\s*/, "").trim();
      if (content) out.push(`[REF] ${content}`);
      continue;
    }

    if (looksLikeReference(trim)) {
      const content = trim.replace(/^\[\d+\]\s*/, "");
      out.push(`[REF] ${content}`);
      continue;
    }

    const caption = captionOf(trim);
    if (caption) {
      out.push(`[${caption}] ${trim}`);
      continue;
    }

    if (isMarkdownTableLine(trim)) {
      if (!isMarkdownTableSeparator(trim)) {
        out.push(`[TABLE] ${trim}`);
      }
      continue;
    }

    // 只把「像公式」的短行当公式：有等号、很短、没有句号逗号、中文字不多
    const cjkCount = (trim.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (
      /^公式\s*[:：]/.test(trim) ||
      /^\$\$.*\$\$$/.test(trim) ||
      looksLikeEquation(trim, cjkCount)
    ) {
      out.push(`[FORMULA] ${trim.replace(/^公式\s*[:：]\s*/, "")}`);
      continue;
    }

    const heading = headingOf(trim, shift);
    if (heading) {
      let level = heading.level;
      // 前面没有二级标题的三级标题提升为二级，避免编出 1.0.1
      if (level === 3 && !h2Seen) level = 2;
      h2Seen = level === 1 ? false : h2Seen || level === 2;
      out.push(`[H${level}] ${heading.text}`);
      continue;
    }

    out.push(trim);
  }

  return out.join("\n").trim();
}

export function extractStructure(text) {
  return text.split("\n").map((line, index) => {
    const trim = line.trim();

    if (trim === "[ABSTRACT]") return { type: "摘要标题", text: "摘要", index };
    if (trim === "[ABSTRACT_EN]") return { type: "英文摘要标题", text: "Abstract", index };
    if (trim === "[REFERENCES]") return { type: "参考文献标题", text: "参考文献", index };
    if (trim === "[ACKNOWLEDGEMENTS]") return { type: "致谢标题", text: "致谢", index };
    if (/^\[APPENDIX\] /.test(trim)) return { type: "附录标题", text: trim.replace(/^\[APPENDIX\] /, ""), index };

    if (/^\[META\] /.test(trim)) return { type: "封面信息", text: trim.replace(/^\[META\] /, ""), index };
    if (/^\[KEYWORDS\] /.test(trim)) return { type: "关键词", text: trim.replace(/^\[KEYWORDS\] /, ""), index };
    if (/^\[KEYWORDS_EN\] /.test(trim)) return { type: "英文关键词", text: trim.replace(/^\[KEYWORDS_EN\] /, ""), index };
    if (/^\[H1\] /.test(trim)) return { type: "一级标题", text: trim.replace(/^\[H1\] /, ""), index };
    if (/^\[H2\] /.test(trim)) return { type: "二级标题", text: trim.replace(/^\[H2\] /, ""), index };
    if (/^\[H3\] /.test(trim)) return { type: "三级标题", text: trim.replace(/^\[H3\] /, ""), index };
    if (/^\[REF\] /.test(trim)) return { type: "参考文献条目", text: trim.replace(/^\[REF\] /, ""), index };
    if (/^\[TABLE_CAPTION\] /.test(trim)) return { type: "表题", text: trim.replace(/^\[TABLE_CAPTION\] /, ""), index };
    if (/^\[FIGURE_CAPTION\] /.test(trim)) return { type: "图题", text: trim.replace(/^\[FIGURE_CAPTION\] /, ""), index };
    if (/^\[TABLE\] /.test(trim)) return { type: "表格行", text: trim.replace(/^\[TABLE\] /, ""), index };
    if (/^\[FORMULA\] /.test(trim)) return { type: "公式", text: trim.replace(/^\[FORMULA\] /, ""), index };

    if (listItemText(trim)) return { type: "编号列表", text: trim, index };
    if (/^-\s+/.test(trim)) return { type: "项目符号", text: trim, index };
    if (trim === "") return { type: "空行", text: "", index };

    return { type: "正文", text: trim, index };
  });
}

/** 网页预览。numbering 和 Word 导出的编号方式一致，用来显示列表序号。 */
export function toHtml(text, { numbering = "cn" } = {}) {
  const lines = text.split("\n");
  const result = [];

  let zone = "body";

  for (const line of lines) {
    const trim = line.trim();

    if (trim === "[ABSTRACT]") {
      zone = "abstract";
      result.push(`<h2 class="section-title">摘\u3000要</h2>`);
      continue;
    }

    if (trim === "[ABSTRACT_EN]") {
      zone = "abstractEn";
      result.push(`<h2 class="section-title">Abstract</h2>`);
      continue;
    }

    if (trim === "[REFERENCES]") {
      zone = "references";
      result.push(`<h2 class="section-title">参考文献</h2>`);
      continue;
    }

    if (trim === "[ACKNOWLEDGEMENTS]") {
      zone = "body";
      result.push(`<h2 class="section-title">致谢</h2>`);
      continue;
    }

    if (/^\[APPENDIX\] /.test(trim)) {
      zone = "body";
      result.push(`<h2 class="section-title">${escapeHtml(trim.replace(/^\[APPENDIX\] /, ""))}</h2>`);
      continue;
    }

    if (/^\[META\] /.test(trim)) continue;

    if (/^\[KEYWORDS\] /.test(trim)) {
      const kw = trim.replace(/^\[KEYWORDS\] /, "");
      result.push(`<p class="keywords"><strong>关键词：</strong>${escapeHtml(kw)}</p>`);
      zone = "body";
      continue;
    }

    if (/^\[KEYWORDS_EN\] /.test(trim)) {
      const kw = trim.replace(/^\[KEYWORDS_EN\] /, "");
      result.push(`<p class="keywords"><strong>Keywords: </strong>${escapeHtml(kw)}</p>`);
      zone = "body";
      continue;
    }

    if (/^\[H1\] /.test(trim)) {
      zone = "body";
      const title = trim.replace(/^\[H1\] /, "");
      result.push(`<h2 class="chapter-title">${escapeHtml(title)}</h2>`);
      continue;
    }

    if (/^\[H2\] /.test(trim)) {
      const title = trim.replace(/^\[H2\] /, "");
      result.push(`<h3 class="section-h2">${escapeHtml(title)}</h3>`);
      continue;
    }

    if (/^\[H3\] /.test(trim)) {
      const title = trim.replace(/^\[H3\] /, "");
      result.push(`<h4 class="section-h3">${escapeHtml(title)}</h4>`);
      continue;
    }

    if (/^\[REF\] /.test(trim)) {
      const content = trim.replace(/^\[REF\] /, "");
      result.push(`<p class="reference-item">${escapeHtml(content)}</p>`);
      continue;
    }

    if (/^\[TABLE_CAPTION\] /.test(trim)) {
      result.push(`<p class="table-caption">${escapeHtml(trim.replace(/^\[TABLE_CAPTION\] /, ""))}</p>`);
      continue;
    }

    if (/^\[FIGURE_CAPTION\] /.test(trim)) {
      result.push(`<p class="figure-caption">${escapeHtml(trim.replace(/^\[FIGURE_CAPTION\] /, ""))}</p>`);
      continue;
    }

    if (/^\[TABLE\] /.test(trim)) {
      result.push(`<p class="table-row">${escapeHtml(trim.replace(/^\[TABLE\] /, ""))}</p>`);
      continue;
    }

    if (/^\[FORMULA\] /.test(trim)) {
      result.push(`<p class="formula">${escapeHtml(trim.replace(/^\[FORMULA\] /, ""))}</p>`);
      continue;
    }

    if (trim === "") {
      result.push(`<div class="para-gap"></div>`);
      continue;
    }

    if (/^-\s+/.test(trim)) {
      result.push(`<p class="list-item">${escapeHtml(trim.replace(/^-\s+/, ""))}</p>`);
      continue;
    }

    const listItem = listItemText(trim, numbering);
    if (listItem) {
      result.push(`<p class="list-item">${escapeHtml(listItem)}</p>`);
      continue;
    }

    const cls = zone === "abstract" || zone === "abstractEn" ? "abstract-body" : "body-para";
    result.push(`<p class="${cls}">${escapeHtml(trim)}</p>`);
  }

  return result.join("\n");
}

/** 导出用的完整 HTML 页面，题目经过转义。 */
export function htmlDocument(title, bodyHtml) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${getCss()}</style></head><body><div class="preview">${bodyHtml}</div></body></html>`;
}

export function getCss() {
  return `
    .preview {
      font-family: "SimSun", "宋体", serif;
      font-size: 14pt;
      line-height: 1.8;
      max-width: 820px;
      margin: 0 auto;
      padding: 24px 32px;
      color: #111;
    }
    .preview .chapter-title {
      font-family: "SimHei", "黑体", sans-serif;
      font-size: 15pt;
      font-weight: bold;
      text-align: center;
      margin: 28px 0 14px;
    }
    .preview .section-title {
      font-family: "SimHei", "黑体", sans-serif;
      font-size: 14pt;
      font-weight: bold;
      text-align: center;
      margin: 20px 0 10px;
    }
    .preview h3.section-h2 {
      font-family: "SimHei", "黑体", sans-serif;
      font-size: 13pt;
      font-weight: bold;
      margin: 16px 0 8px;
    }
    .preview h4.section-h3 {
      font-family: "SimHei", "黑体", sans-serif;
      font-size: 12pt;
      font-weight: bold;
      margin: 12px 0 6px;
      padding-left: 1em;
    }
    .preview .body-para,
    .preview .abstract-body {
      text-indent: 2em;
      margin: 0 0 6px;
    }
    .preview .keywords {
      margin: 8px 0;
    }
    .preview .reference-item {
      padding-left: 2em;
      text-indent: -2em;
      margin: 4px 0;
      counter-increment: ref-counter;
    }
    .preview .reference-item::before {
      content: "[" counter(ref-counter) "] ";
    }
    .preview { counter-reset: ref-counter; }
    .preview .list-item {
      text-indent: 2em;
      margin: 4px 0;
    }
    .preview .table-caption,
    .preview .figure-caption {
      text-align: center;
      font-size: 12pt;
      margin: 10px 0 6px;
    }
    .preview .table-row {
      font-family: Consolas, monospace;
      font-size: 11pt;
      margin: 2px 0;
      white-space: pre-wrap;
    }
    .preview .formula {
      text-align: center;
      font-family: "Times New Roman", serif;
      margin: 10px 0;
    }
    .preview .para-gap { height: 8px; }
  `;
}