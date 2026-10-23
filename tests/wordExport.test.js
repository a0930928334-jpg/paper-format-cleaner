import { test } from "node:test";
import assert from "node:assert/strict";
import { Packer } from "docx";
import JSZip from "jszip";
import { normalizeText } from "../src/utils/cleaner.js";
import { applyInputFallbacks, parseMeta } from "../src/utils/paper.js";
import { DEFAULT_STYLE } from "../src/utils/templateRules.js";
import { buildGenericDocument, buildPaperDocument, headingLabel, parsePaper } from "../src/utils/wordExport.js";
import { SAMPLE_TEXT } from "../src/sample.js";

const cleaned = normalizeText(applyInputFallbacks(SAMPLE_TEXT));

async function unzip(doc) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const read = (name) => zip.file(name).async("string");
  const footers = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f)).map(read));
  const headers = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/header\d*\.xml$/.test(f)).map(read));
  return { document: await read("word/document.xml"), footers, headers };
}

test("两种编号方式", () => {
  assert.equal(headingLabel(1, [2, 0, 0], "cn"), "二、");
  assert.equal(headingLabel(2, [2, 3, 0], "cn"), "（三）");
  assert.equal(headingLabel(3, [2, 3, 4], "cn"), "4.");
  assert.equal(headingLabel(2, [2, 3, 0], "arabic"), "2.3");
  assert.equal(headingLabel(3, [2, 3, 4], "arabic"), "2.3.4");
});

test("新的一章会重置节编号", () => {
  const paper = parsePaper(cleaned, "cn");
  const labels = paper.body.filter((b) => b.type === "heading").map((h) => h.label + h.title);
  assert.deepEqual(labels.slice(0, 5), ["一、引言", "二、文献综述", "（一）AI写作工具研究", "（二）文档自动排版研究", "三、系统设计"]);
  assert.equal(labels[5], "（一）文本清洗模块");
});

test("示例论文拆分出摘要、表格和参考文献", () => {
  const paper = parsePaper(cleaned);
  assert.equal(paper.abstract.length, 1);
  assert.ok(paper.keywords.startsWith("人工智能"));
  assert.equal(paper.references.length, 3);
  const table = paper.body.find((b) => b.type === "table");
  assert.equal(table.rows.length, 4);
  assert.deepEqual(table.rows[0], ["模块", "功能"]);
});

test("导出的 Word 带标题样式、目录域、页眉和页码", async () => {
  const { doc } = buildPaperDocument(cleaned, parseMeta(cleaned), DEFAULT_STYLE, { numbering: "cn" });
  const { document, footers, headers } = await unzip(doc);

  assert.ok(document.includes('w:val="Heading1"'), "正文标题使用标题 1 样式");
  assert.ok(document.includes("TOC \\h \\o"), "包含目录域");
  assert.ok(document.includes("一、引言"), "标题带编号");
  assert.ok(document.includes('w:fmt="upperRoman"') && document.includes('w:fmt="decimal"'), "前置部分罗马数字页码，正文阿拉伯数字页码");
  assert.ok(document.includes('w:eastAsia="SimSun"'), "中文字体单独设置");
  assert.ok(footers.some((x) => x.includes("PAGE")), "页脚里有页码域");
  assert.ok(headers.some((x) => x.includes("浙江工商大学本科毕业论文")), "正文有页眉");
  assert.ok(!document.includes("- １ -"), "页码不再写死在正文里");
});

test("普通文档模式按信件格式导出", async () => {
  const { doc, title } = buildGenericDocument("Cover Letter\nDear Hiring Manager,\nI am applying for the role.\nSincerely,", "", DEFAULT_STYLE);
  assert.equal(title, "Cover Letter");
  const { document } = await unzip(doc);
  assert.ok(document.includes("Dear Hiring Manager,"));
  assert.ok(!document.includes("TOC \\h"));
});
