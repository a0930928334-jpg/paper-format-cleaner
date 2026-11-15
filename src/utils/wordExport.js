/**
 * 把清洗后的中间标签文本生成 Word 文档（docx 库）。
 *
 * 与旧版相比：
 * - 标题使用 Word 的「标题 1/2/3」样式，目录是真正的目录域，页码由 Word 计算
 * - 页眉、页码放在页眉页脚里，不再写成正文段落
 * - 中文走宋体/黑体，英文和数字自动走 Times New Roman
 * - 表格默认三线表
 *
 * 纯函数，不依赖浏览器，可以在 node 里测试。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  NumberFormat,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { isMarkdownTableLine, isMarkdownTableSeparator, listItemText, stripInlineMarkdown } from "./cleaner.js";
import { parseMarkdownTableRow, UNTITLED } from "./paper.js";

const CN_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五"];
const cn = (n) => CN_NUMS[n - 1] || String(n);

export const NUMBERING_SCHEMES = {
  cn: "一、 （一） 1.",
  arabic: "1  1.1  1.1.1",
};

/** 按编号方式生成标题前缀。counters = [章, 节, 小节]。 */
export function headingLabel(level, counters, scheme = "cn") {
  const [c, s, ss] = counters;
  if (scheme === "arabic") {
    if (level === 1) return `${c}`;
    if (level === 2) return `${c}.${s}`;
    return `${c}.${s}.${ss}`;
  }
  if (level === 1) return `${cn(c)}、`;
  if (level === 2) return `（${cn(s)}）`;
  return `${ss}.`;
}

/**
 * 把中间标签文本拆成论文各部分。
 * 参考文献、致谢、附录放进有序数组 backMatter，按原文顺序输出；
 * paper.references 仍然是全部参考文献条目的列表。
 */
export function parsePaper(cleaned, scheme = "cn") {
  const paper = { abstract: [], abstractEn: [], keywords: "", keywordsEn: "", body: [], references: [], backMatter: [] };
  const counters = [0, 0, 0];
  let zone = "preamble";
  let blocks = paper.body; // 正文块写到哪里：正文，或者当前的后置部分
  let numbered = true; // 致谢、附录里的小标题不编号
  let refs = null;

  const startPart = (part) => {
    paper.backMatter.push(part);
    blocks = part.blocks;
    numbered = part.kind === "body" || part.kind === "references";
  };
  const referencesPart = () => refs || (refs = { kind: "references", title: "参考文献", items: [], blocks: [] });
  const addReference = (text) => {
    if (!text) return;
    referencesPart().items.push(text);
    paper.references.push(text);
  };

  const heading = (level, title) => {
    // 后置部分之后又出现一级标题：按原文位置接着输出正文
    if (level === 1 && paper.backMatter.length) startPart({ kind: "body", blocks: [] });
    zone = "body";
    if (!numbered) {
      blocks.push({ type: "heading", level, title, label: "" });
      return;
    }
    counters[level - 1] += 1;
    for (let i = level; i < 3; i++) counters[i] = 0;
    blocks.push({ type: "heading", level, title, label: headingLabel(level, counters, scheme) });
  };

  for (const raw of cleaned.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("[META] ")) continue;

    if (line === "[ABSTRACT]") { zone = "abstract"; continue; }
    if (line === "[ABSTRACT_EN]") { zone = "abstractEn"; continue; }
    if (line === "[REFERENCES]") {
      if (!paper.backMatter.includes(referencesPart())) startPart(referencesPart());
      zone = "references";
      continue;
    }
    if (line === "[ACKNOWLEDGEMENTS]") { startPart({ kind: "acknowledgements", title: "致谢", blocks: [] }); zone = "back"; continue; }

    const tag = line.match(/^\[([A-Z_0-9]+)\] ?(.*)$/);
    if (tag) {
      const [, name, content] = tag;
      const text = content.trim();
      if (name === "KEYWORDS") { paper.keywords = text; zone = "body"; continue; }
      if (name === "KEYWORDS_EN") { paper.keywordsEn = text; zone = "body"; continue; }
      if (name === "H1") { heading(1, text); continue; }
      if (name === "H2") { heading(2, text); continue; }
      if (name === "H3") { heading(3, text); continue; }
      if (name === "REF") { addReference(text); continue; }
      if (name === "APPENDIX") { startPart({ kind: "appendix", title: text || "附录", blocks: [] }); zone = "back"; continue; }
      if (name === "TABLE_CAPTION") { blocks.push({ type: "tableCaption", text }); zone = "body"; continue; }
      if (name === "FIGURE_CAPTION") { blocks.push({ type: "figureCaption", text }); zone = "body"; continue; }
      if (name === "FORMULA") { blocks.push({ type: "formula", text }); zone = "body"; continue; }
      if (name === "TABLE") {
        const row = parseMarkdownTableRow(text);
        const last = blocks[blocks.length - 1];
        if (last && last.type === "table") last.rows.push(row);
        else blocks.push({ type: "table", rows: [row] });
        zone = "body";
        continue;
      }
    }

    if (zone === "abstract") { paper.abstract.push(line); continue; }
    if (zone === "abstractEn") { paper.abstractEn.push(line); continue; }
    if (zone === "references") { addReference(line); continue; }

    // 项目符号去掉；列表项保留序号并统一格式；小数、年份开头的正文原样保留
    const text = line.replace(/^(?:-\s+|[•·]\s*)/, "").trim();
    if (text) blocks.push({ type: "paragraph", text: listItemText(text, scheme) ?? text });
  }

  // 正文里零散的参考文献条目、但没有「参考文献」标题时，放在后置部分最前面
  if (refs && !paper.backMatter.includes(refs)) paper.backMatter.unshift(refs);
  return paper;
}

/* ---------- 段落工具 ---------- */

function fontsFor(style, cjk) {
  return { ascii: style.englishFont, hAnsi: style.englishFont, cs: style.englishFont, eastAsia: cjk };
}

function makeRun(style, r, defaults = {}) {
  return new TextRun({
    text: r.text ?? "",
    bold: r.bold ?? defaults.bold ?? false,
    italics: r.italics ?? false,
    size: Number(r.size ?? defaults.size ?? style.bodySize),
    font: fontsFor(style, r.cjkFont ?? defaults.cjkFont ?? style.bodyFont),
  });
}

function para(style, runs, opts = {}) {
  const list = Array.isArray(runs) ? runs : [{ text: runs }];
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    heading: opts.heading,
    indent: opts.indent,
    keepNext: opts.keepNext,
    spacing: opts.spacing ?? { line: Number(style.lineSpacing), after: Number(style.paragraphAfter) },
    children: list.map((r) => makeRun(style, r, opts)),
  });
}

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const blank = (after = 240) => new Paragraph({ spacing: { after }, children: [] });

const RULE_THICK = { style: BorderStyle.SINGLE, size: 12, color: "000000" };
const RULE_THIN = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const NO_RULE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

/** 三线表：表头上下各一条线，表格底部一条线，没有竖线。 */
export function threeLineTable(rows, style) {
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: RULE_THICK,
      bottom: RULE_THICK,
      left: NO_RULE,
      right: NO_RULE,
      insideHorizontal: NO_RULE,
      insideVertical: NO_RULE,
    },
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: Array.from({ length: width }, (_, i) =>
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              borders: rowIndex === 0 ? { bottom: RULE_THIN } : undefined,
              children: [
                para(style, [{ text: cells[i] ?? "", bold: rowIndex === 0 }], {
                  align: AlignmentType.CENTER,
                  size: style.tableSize,
                  spacing: { before: 40, after: 40 },
                }),
              ],
            })
          ),
        })
    ),
  });
}

function centeredFooter(style, prefix = "- ", suffix = " -") {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            children: [prefix, PageNumber.CURRENT, suffix],
            size: 18,
            font: fontsFor(style, style.bodyFont),
          }),
        ],
      }),
    ],
  });
}

function documentStyles(style) {
  const heading = (size, align, before, after) => ({
    run: { size: Number(size), bold: true, color: "000000", font: fontsFor(style, style.headingFont) },
    paragraph: { alignment: align, spacing: { before, after, line: Number(style.lineSpacing) }, keepNext: true },
  });
  return {
    default: {
      document: { run: { size: Number(style.bodySize), font: fontsFor(style, style.bodyFont) } },
      heading1: heading(style.headingSize, AlignmentType.CENTER, 360, 240),
      heading2: heading(style.smallHeadingSize, AlignmentType.LEFT, 240, 120),
      heading3: heading(style.smallHeadingSize, AlignmentType.LEFT, 180, 100),
    },
  };
}

function pageProps(extra = {}) {
  return { page: { margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 }, ...extra } };
}

/* ---------- 论文模式 ---------- */

function coverPage(meta, style) {
  const isZjgsu = meta.school.includes("浙江工商");
  const out = [blank(520)];
  out.push(para(style, [{ text: meta.school, bold: true, size: 38, cjkFont: style.headingFont }], { align: AlignmentType.CENTER, spacing: { after: 520 } }));
  if (isZjgsu) {
    out.push(para(style, "毕业论文（设计）：正文", { align: AlignmentType.CENTER, size: 24, spacing: { after: 1080 } }));
  }
  out.push(para(style, [{ text: "本科毕业论文（设计）", bold: true, size: 36, cjkFont: style.headingFont }], { align: AlignmentType.CENTER, spacing: { after: 760 } }));
  out.push(para(style, [{ text: `题目：${meta.title}`, bold: true, size: 28 }], { align: AlignmentType.CENTER, spacing: { after: 180 } }));
  if (meta.englishTitle) {
    out.push(para(style, [{ text: meta.englishTitle, size: 24 }], { align: AlignmentType.CENTER, spacing: { after: 820 } }));
  } else {
    out.push(blank(820));
  }

  const rows = [
    ["专　　业", meta.major],
    ["班　　级", meta.className],
    ["学　　号", meta.studentId],
    ["姓　　名", meta.name],
  ];
  for (const [label, value] of rows) {
    out.push(para(style, [{ text: `${label}：` }, { text: value || "　".repeat(10) }], { align: AlignmentType.CENTER, size: 26, spacing: { after: 260 } }));
  }
  out.push(blank(500));
  out.push(para(style, meta.date, { align: AlignmentType.CENTER, size: 26 }));
  return out;
}

function abstractBlock(style, { title, label, paragraphs, placeholder, keywordLabel, keywords, keywordPlaceholder, english }) {
  const out = [];
  const cjkFont = english ? style.englishFont : style.headingFont;
  out.push(para(style, [{ text: title, bold: true, size: style.headingSize, cjkFont }], { align: AlignmentType.CENTER, spacing: { after: 300 } }));
  const items = paragraphs.length ? paragraphs : [placeholder];
  items.forEach((text, i) => {
    const runs = i === 0 ? [{ text: label, bold: true, cjkFont }, { text }] : [{ text }];
    out.push(para(style, runs, { indent: i === 0 ? undefined : { firstLine: Number(style.firstLineIndent) } }));
  });
  out.push(para(style, [{ text: keywordLabel, bold: true, cjkFont }, { text: keywords || keywordPlaceholder }], { spacing: { line: Number(style.lineSpacing), after: 420 } }));
  return out;
}

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

function headingParagraph(level, text) {
  return new Paragraph({
    heading: HEADING_LEVELS[level - 1],
    indent: level === 3 ? { left: 0 } : undefined,
    children: [new TextRun({ text })],
  });
}

function headingText(item) {
  if (!item.label) return item.title;
  const sep = item.label.endsWith("、") || item.label.endsWith("）") ? "" : " ";
  return `${item.label}${sep}${item.title}`;
}

/** 正文块（标题、段落、表格、图表题、公式）转成 Word 段落。 */
function renderBlocks(items, style) {
  const out = [];
  for (const item of items) {
    if (item.type === "heading") {
      out.push(headingParagraph(item.level, headingText(item)));
      continue;
    }
    if (item.type === "tableCaption") {
      out.push(para(style, [{ text: item.text, bold: true, size: style.tableSize, cjkFont: style.headingFont }], { align: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 80 } }));
      continue;
    }
    if (item.type === "figureCaption") {
      out.push(para(style, "【在此处插入图片】", { align: AlignmentType.CENTER, size: 21, keepNext: true, spacing: { before: 240, after: 120 } }));
      out.push(para(style, [{ text: item.text, size: style.tableSize }], { align: AlignmentType.CENTER, spacing: { after: 200 } }));
      continue;
    }
    if (item.type === "formula") {
      out.push(para(style, [{ text: item.text, italics: true, cjkFont: style.englishFont }], { align: AlignmentType.CENTER, spacing: { before: 120, after: 120 } }));
      continue;
    }
    if (item.type === "table") {
      const table = threeLineTable(item.rows, style);
      if (table) out.push(table, blank(160));
      continue;
    }
    out.push(para(style, item.text, { indent: { firstLine: Number(style.firstLineIndent) } }));
  }
  return out;
}

/** 正文，加上按原文顺序排列的参考文献、致谢、附录（各自另起一页，标题 1 样式，不编号）。 */
function bodyBlocks(paper, style) {
  const out = renderBlocks(paper.body, style);
  let refNo = 0;
  for (const part of paper.backMatter) {
    if (part.kind === "body") {
      out.push(...renderBlocks(part.blocks, style));
      continue;
    }
    if (part.kind === "references" && !part.items.length && !part.blocks.length) continue;
    out.push(pageBreak(), headingParagraph(1, part.title));
    for (const ref of part.items || []) {
      out.push(para(style, `[${++refNo}] ${ref}`, { indent: { left: 420, hanging: 420 }, size: 21 }));
    }
    out.push(...renderBlocks(part.blocks, style));
  }
  return out;
}

export function buildPaperDocument(cleaned, meta, style, options = {}) {
  const scheme = options.numbering || "cn";
  const paper = parsePaper(cleaned, scheme);
  const title = meta.title && meta.title !== UNTITLED ? meta.title : "论文题目";

  const front = [
    ...abstractBlock(style, {
      title,
      label: "摘　要：",
      paragraphs: paper.abstract,
      placeholder: "请填写摘要内容。",
      keywordLabel: "关键词：",
      keywords: paper.keywords,
      keywordPlaceholder: "请填写关键词",
    }),
  ];
  if (meta.englishTitle || paper.abstractEn.length || paper.keywordsEn) {
    front.push(
      ...abstractBlock(style, {
        title: meta.englishTitle || "English Title",
        label: "Abstract: ",
        paragraphs: paper.abstractEn,
        placeholder: "Please fill in the English abstract.",
        keywordLabel: "Keywords: ",
        keywords: paper.keywordsEn,
        keywordPlaceholder: "Keywords",
        english: true,
      })
    );
  }
  front.push(pageBreak());
  front.push(para(style, [{ text: "目　录", bold: true, size: style.headingSize, cjkFont: style.headingFont }], { align: AlignmentType.CENTER, spacing: { after: 360 } }));
  front.push(new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-3" }));

  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
        children: [new TextRun({ text: `${meta.school}本科毕业论文（设计）`, size: 18, font: fontsFor(style, style.bodyFont) })],
      }),
    ],
  });

  return {
    paper,
    doc: new Document({
      creator: meta.name || "AI 论文格式清洗器",
      title,
      features: { updateFields: true },
      styles: documentStyles(style),
      sections: [
        { properties: pageProps(), children: coverPage({ ...meta, title }, style) },
        {
          properties: pageProps({ pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } }),
          footers: { default: centeredFooter(style, "", "") },
          children: front,
        },
        {
          properties: pageProps({ pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }),
          headers: { default: header },
          footers: { default: centeredFooter(style) },
          children: bodyBlocks(paper, style),
        },
      ],
    }),
  };
}

/* ---------- 普通文档模式（求职信、报告等） ---------- */

const LETTER_LINE = /^(Dear\b|Sincerely|Best regards|Kind regards|To:|Subject:|Re:)/i;

export function buildGenericDocument(rawText, titleHint, style) {
  let lines = String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(stripInlineMarkdown)
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line.toLowerCase() !== "documents:");

  const firstLine = (lines[0] || "").replace(/^#{1,6}\s+/, "");
  let title = titleHint && titleHint !== UNTITLED ? titleHint : "";
  if (!title) title = firstLine && firstLine.length <= 120 ? firstLine : "清洗后的文档";
  if (firstLine === title) lines = lines.slice(1);

  const children = [
    para(style, [{ text: title, bold: true, size: style.headingSize, cjkFont: style.headingFont }], { align: AlignmentType.CENTER, spacing: { after: 420 } }),
  ];
  const headingRun = (text) => [{ text, bold: true, size: style.smallHeadingSize, cjkFont: style.headingFont }];
  const headingSpacing = { before: 260, after: 160 };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const md = line.match(/^(#{1,6})\s+(.+)$/);
    if (isMarkdownTableLine(line)) {
      // 连续的 Markdown 表格行合成一张三线表
      const rows = [];
      for (; i < lines.length && isMarkdownTableLine(lines[i]); i++) {
        if (!isMarkdownTableSeparator(lines[i])) rows.push(parseMarkdownTableRow(lines[i]));
      }
      i--;
      const table = threeLineTable(rows, style);
      if (table) children.push(table, blank(160));
    } else if (md) {
      const level = Math.min(3, md[1].length);
      children.push(para(style, headingRun(md[2]), { heading: HEADING_LEVELS[level - 1], align: AlignmentType.LEFT, spacing: headingSpacing }));
    } else if (/^[IVX]+\.\s+/.test(line)) {
      children.push(para(style, headingRun(line), { align: AlignmentType.LEFT, spacing: headingSpacing }));
    } else if (LETTER_LINE.test(line)) {
      children.push(para(style, line, { align: AlignmentType.LEFT, spacing: { after: 140 } }));
    } else if (/[:：]$/.test(line) && line.length <= 100) {
      children.push(para(style, [{ text: line, bold: true }], { align: AlignmentType.LEFT, spacing: { before: 180, after: 100 } }));
    } else {
      children.push(para(style, line.replace(/^(?:[-*+]\s+|[•·]\s*)/, ""), { indent: { firstLine: Number(style.firstLineIndent) } }));
    }
  }

  return {
    title,
    doc: new Document({
      title,
      styles: documentStyles(style),
      sections: [{ properties: pageProps(), footers: { default: centeredFooter(style) }, children }],
    }),
  };
}
