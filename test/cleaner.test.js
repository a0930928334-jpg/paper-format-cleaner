import test from "node:test";
import assert from "node:assert/strict";

import { extractStructure, normalizeText, toHtml } from "../src/utils/cleaner.js";
import { applyStructureOverrides } from "../src/utils/structureOverrides.js";
import { analyzeTemplateText } from "../src/utils/templateRules.js";

test("识别论文元数据和三级标题结构", () => {
  const cleaned = normalizeText(`学校：浙江工商大学
论文题目：测试论文
摘要
摘要正文
关键词：排版；测试
一 引言
（一）研究背景
1.1.1 研究问题`);

  assert.match(cleaned, /\[META\] 学校：浙江工商大学/);
  assert.match(cleaned, /\[ABSTRACT\]/);
  assert.match(cleaned, /\[KEYWORDS\] 排版；测试/);
  assert.match(cleaned, /\[H1\] 引言/);
  assert.match(cleaned, /\[H2\] 研究背景/);
  assert.match(cleaned, /\[H3\] 研究问题/);

  const types = extractStructure(cleaned).map((item) => item.type);
  assert.ok(types.includes("一级标题"));
  assert.ok(types.includes("二级标题"));
  assert.ok(types.includes("三级标题"));
});

test("Markdown 表格分隔行不会被当成数据", () => {
  const cleaned = normalizeText(`表1 模块说明
| 模块 | 功能 |
| --- | --- |
| 清洗 | 去除噪声 |`);

  const tableRows = cleaned
    .split("\n")
    .filter((line) => line.startsWith("[TABLE] "));

  assert.equal(tableRows.length, 2);
});

test("HTML 预览会转义用户输入", () => {
  const html = toHtml("<script>alert('xss')</script>");

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("参考文献会持续识别到文档末尾", () => {
  const cleaned = normalizeText(`参考文献
[1] 张三，人工智能导论。
李四，文档排版研究。`);

  assert.equal(
    cleaned.split("\n").filter((line) => line.startsWith("[REF] ")).length,
    2
  );
});

test("格式说明只返回明确出现的规则", () => {
  const result = analyzeTemplateText(
    "浙江工商大学毕业论文要求：正文宋体、小四，标题黑体，1.5 倍行距，首行缩进 2 字符。",
    "rules.docx"
  );

  assert.equal(result.school, "浙江工商大学");
  assert.deepEqual(result.styleUpdates, {
    bodyFont: "SimSun",
    headingFont: "SimHei",
    bodySize: 24,
    lineSpacing: 360,
    firstLineIndent: 420,
  });
  assert.equal(result.appliedRuleCount, 5);
});

test("没有明确格式说明时不会覆盖当前样式", () => {
  const result = analyzeTemplateText("这是一份普通论文内容。", "paper.pdf");

  assert.deepEqual(result.styleUpdates, {});
  assert.equal(result.appliedRuleCount, 0);
});

test("人工修正会改变结构识别和预览结果", () => {
  const overridden = applyStructureOverrides(
    "[H1] Introduction\nBody paragraph",
    { 0: "body", 1: "heading2" }
  );

  assert.equal(overridden, "[BODY] Introduction\n[H2] Body paragraph");
  assert.deepEqual(
    extractStructure(overridden).map((item) => item.type),
    ["正文", "二级标题"]
  );

  const html = toHtml(overridden);
  assert.match(html, /<p class="body-para">Introduction<\/p>/);
  assert.match(html, /<h3 class="section-h2">Body paragraph<\/h3>/);
});

test("忽略首行时仍保留后续人工修正的行号", () => {
  const overridden = applyStructureOverrides(
    "[H1] Title\nBody\n[H1] Conclusion",
    { 0: "ignore", 1: "heading2" }
  );
  const lines = overridden.split("\n");

  assert.equal(lines.length, 3);
  assert.equal(lines[0], "");
  assert.equal(lines[1], "[H2] Body");
  assert.equal(lines[2], "[H1] Conclusion");
});

test("正文可以人工改为摘要正文", () => {
  const overridden = applyStructureOverrides("Abstract content", {
    0: "abstractBody",
  });

  assert.equal(overridden, "[ABSTRACT_BODY] Abstract content");
  assert.equal(extractStructure(overridden)[0].type, "摘要正文");
  assert.match(toHtml(overridden), /class="abstract-body"/);
});
