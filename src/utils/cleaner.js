/**
 * AI 论文格式清洗：把原始文本转换成带结构标签的中间文本
 *
 * 目标：
 * 1. 将原始 AI 文本转换成稳定的中间结构标签
 * 2. 支持封面信息、摘要、英文摘要、关键词、正文标题、参考文献
 * 3. 支持基础表格、图题、表题、公式行识别
 * 4. 标题只保留纯标题，编号交给 Word 导出阶段统一生成
 */

function escapeHtml(str) {
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

function isMarkdownTableLine(line) {
  const t = line.trim();
  return /^\|.+\|$/.test(t);
}

function isMarkdownTableSeparator(line) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

export function normalizeText(input) {
  let text = input || "";

  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/\u3000/g, " ");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/^(#{1,6})([^#\s])/gm, "$1 $2");
  text = text.replace(/^[•·]\s*/gm, "- ");
  text = text.replace(/^(\d+)[)）]\s*/gm, "$1. ");

  const lines = text.split("\n");
  const out = [];

  const META_KEYS =
    /^(学校|院校|论文题目|题目|英文题目|英文标题|专业|班级|学号|姓名|日期)[:：]/;

  let inReferences = false;

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

    if (/^摘\s*要\s*[:：]?\s*$/.test(trim)) {
      inReferences = false;
      out.push("[ABSTRACT]");
      continue;
    }

    if (/^Abstract\s*[:：]?\s*$/i.test(trim)) {
      inReferences = false;
      out.push("[ABSTRACT_EN]");
      continue;
    }

    if (/^关\s*键\s*词\s*[:：]?\s*/.test(trim)) {
      const kw = trim.replace(/^关\s*键\s*词\s*[:：]?\s*/, "").trim();
      out.push(`[KEYWORDS] ${kw}`);
      continue;
    }

    if (/^Keywords?\s*[:：]?\s*/i.test(trim)) {
      const kw = trim.replace(/^Keywords?\s*[:：]?\s*/i, "").trim();
      out.push(`[KEYWORDS_EN] ${kw}`);
      continue;
    }

    if (/^参考文献\s*$/.test(trim)) {
      inReferences = true;
      out.push("[REFERENCES]");
      continue;
    }

    if (inReferences) {
      const content = trim.replace(/^\[\d+\]\s*/, "").trim();
      if (content) out.push(`[REF] ${content}`);
      continue;
    }

    if (/^\[\d+\]/.test(trim)) {
      const content = trim.replace(/^\[\d+\]\s*/, "");
      out.push(`[REF] ${content}`);
      continue;
    }

    if (/^表\s*\d+/.test(trim)) {
      out.push(`[TABLE_CAPTION] ${trim}`);
      continue;
    }

    if (/^图\s*\d+/.test(trim)) {
      out.push(`[FIGURE_CAPTION] ${trim}`);
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
      (/=/.test(trim) && trim.length <= 90 && !/[。！？，；]/.test(trim) && cjkCount <= 10)
    ) {
      out.push(`[FORMULA] ${trim.replace(/^公式\s*[:：]\s*/, "")}`);
      continue;
    }

    const isH3 =
      /^\d+\.\d+\.\d+\s+\S/.test(trim) ||
      /^###\s+/.test(trim);

    if (isH3) {
      const pure = stripHeadingNumber(trim.replace(/^###\s+/, ""));
      out.push(`[H3] ${pure}`);
      continue;
    }

    const isH2 =
      /^[（(][一二三四五六七八九十\d]+[）)]\s*\S/.test(trim) ||
      /^\d+\.\d+\s+\S/.test(trim) ||
      /^##\s+/.test(trim);

    if (isH2) {
      const pure = stripHeadingNumber(trim.replace(/^##\s+/, ""));
      out.push(`[H2] ${pure}`);
      continue;
    }

    const isH1 =
      /^第\s*[\d一二三四五六七八九十百]+\s*[章节]\s+\S/.test(trim) ||
      new RegExp(`^[${CN}]+[、.．]\\s*\\S`).test(trim) ||
      new RegExp(`^[${CN}]+\\s+[^\\d\\s]`).test(trim) ||
      /^#\s+/.test(trim);

    if (isH1) {
      const pure = stripHeadingNumber(trim.replace(/^#\s+/, ""));
      out.push(`[H1] ${pure}`);
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

    if (/^\d+\.\s+/.test(trim)) return { type: "编号列表", text: trim, index };
    if (/^-\s+/.test(trim)) return { type: "项目符号", text: trim, index };
    if (trim === "") return { type: "空行", text: "", index };

    return { type: "正文", text: trim, index };
  });
}

export function toHtml(text) {
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

    if (/^\d+\.\s+/.test(trim)) {
      result.push(`<p class="list-item">${escapeHtml(trim)}</p>`);
      continue;
    }

    const cls = zone === "abstract" || zone === "abstractEn" ? "abstract-body" : "body-para";
    result.push(`<p class="${cls}">${escapeHtml(trim)}</p>`);
  }

  return result.join("\n");
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