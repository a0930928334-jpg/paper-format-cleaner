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

/** 拆出 document.xml 里每个段落的样式和文字。 */
function paragraphs(xml) {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([p]) => ({
    style: (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "",
    text: [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""),
    pageBreak: p.includes('w:type="page"'),
  }));
}

test("致谢、附录另起一页，用标题 1 样式但不编号，并按原文顺序放在参考文献后面", async () => {
  const text = "论文题目：甲\n摘要\n内容\n关键词：乙\n一、引言\n正文。\n参考文献\n[1] 张三. 文献[J]. 2020.\n致谢\n感谢导师。\n附录A 调查问卷\n问卷内容。";
  const back = normalizeText(text);
  const paper = parsePaper(back);
  assert.deepEqual(paper.backMatter.map((p) => p.kind), ["references", "acknowledgements", "appendix"]);
  assert.equal(paper.references.length, 1);

  const { doc } = buildPaperDocument(back, parseMeta(back), DEFAULT_STYLE);
  const paras = paragraphs((await unzip(doc)).document);
  const at = (text) => paras.findIndex((p) => p.text === text && !p.style.startsWith("TOC"));
  for (const title of ["参考文献", "致谢", "附录A 调查问卷"]) {
    const i = at(title);
    assert.ok(i > 0, `找到「${title}」`);
    assert.equal(paras[i].style, "Heading1", `「${title}」是标题 1`);
    assert.ok(paras[i - 1].pageBreak, `「${title}」前面分页`);
  }
  assert.ok(at("参考文献") < at("致谢") && at("致谢") < at("附录A 调查问卷"), "按原文顺序");
  assert.ok(!paras.some((p) => /^[一二三四五六七八九十]+、(致谢|附录)/.test(p.text)), "致谢、附录没有章节编号");
  assert.ok(at("感谢导师。") > at("致谢"), "致谢正文跟在致谢标题后");
});

test("普通文档模式清理 Markdown：# 标题用标题样式，表格输出为三线表", async () => {
  const raw = "# 周报\n本周**完成**了`排版`工具，详见[文档](https://a.com)。\n## 进展\n| 项目 | 状态 |\n| --- | --- |\n| A | 完成 |\n* 下周计划";
  const { doc, title } = buildGenericDocument(raw, "", DEFAULT_STYLE);
  assert.equal(title, "周报");
  const { document } = await unzip(doc);
  const paras = paragraphs(document);
  assert.ok(paras.some((p) => p.style === "Heading2" && p.text === "进展"), "## 用标题 2 样式");
  assert.ok(paras.some((p) => p.text === "本周完成了排版工具，详见文档。"));
  assert.ok(paras.some((p) => p.text === "下周计划"));
  assert.ok(document.includes("<w:tbl>"), "表格是 Word 表格");
  for (const leftover of ["#", "**", "`", "](", "| --- |"]) assert.ok(!paras.some((p) => p.text.includes(leftover)), `没有残留 ${leftover}`);
});
