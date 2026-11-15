import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../src/utils/cleaner.js";
import { docxHtmlToText, pdfItemsToText, reflowLines } from "../src/utils/fileText.js";
import { applyInputFallbacks } from "../src/utils/paper.js";

const item = (str, hasEOL, y = 700) => ({ str, hasEOL, transform: [12, 0, 0, 12, 72, y] });

test("PDF 文本项按 hasEOL 换行，不再整页拼成一行", () => {
  const items = [item("二、文献综述", true), item("现有研究", false), item("主要关注内容。", true), item("下一段", false)];
  assert.equal(pdfItemsToText(items), "二、文献综述\n现有研究主要关注内容。\n下一段");
});

test("PDF 文本项没有 hasEOL 时按 y 坐标变化换行", () => {
  const items = [
    { str: "第一行", transform: [12, 0, 0, 12, 72, 700] },
    { str: "接着", transform: [12, 0, 0, 12, 140, 700] },
    { str: "第二行", transform: [12, 0, 0, 12, 72, 680] },
  ];
  assert.equal(pdfItemsToText(items), "第一行接着\n第二行");
});

test("PDF 中文硬换行合并成一段", () => {
  assert.equal(reflowLines("近年来，人工智能技术在文本生成\n和学术写作等场景中得到了广泛应用。"), "近年来，人工智能技术在文本生成和学术写作等场景中得到了广泛应用。");
});

test("PDF 英文硬换行加空格合并，连字符断词去掉连字符", () => {
  assert.equal(reflowLines("This paper designs an auto-\nmatic formatting system for\nacademic writing."), "This paper designs an automatic formatting system for academic writing.");
});

test("PDF 标题行不会被并进上一段，也不会吞掉下一行", () => {
  const text = "这一段没有句号结尾\n二、文献综述\n现有研究主要关注内容\n质量。";
  assert.equal(reflowLines(text), "这一段没有句号结尾\n二、文献综述\n现有研究主要关注内容质量。");
});

test("PDF 摘要、关键词、参考文献条目和表格行各自保持一行", () => {
  const text = "摘要\n本文研究了排版\n关键词：AI；排版\n参考文献\n[1] 张三. 论文排版方法[J]. 计算机\n学报, 2020.\n[2] 李四. 文献[M]. 2021.";
  assert.equal(
    reflowLines(text),
    "摘要\n本文研究了排版\n关键词：AI；排版\n参考文献\n[1] 张三. 论文排版方法[J]. 计算机学报, 2020.\n[2] 李四. 文献[M]. 2021."
  );
});

test("PDF 页码行被删掉，跨页的段落接上", () => {
  const pages = ["正文第一页的内容延续到", "- 1 -", "\f", "第二页才结束。", "2"].join("\n");
  assert.equal(reflowLines(pages), "正文第一页的内容延续到第二页才结束。");
  assert.equal(reflowLines("一段话。\n第 12 页\n另一段话。"), "一段话。\n另一段话。");
});

test("PDF 页面中间的纯数字行（如表格数据）不当页码删掉", () => {
  assert.equal(reflowLines("准确率如下：\n95\n召回率如下：\n90\n结束。"), "准确率如下：\n95\n召回率如下：\n90\n结束。");
});

/* ---------- 问题 11：.docx 保留标题结构 ---------- */

const MAMMOTH_HTML = [
  "<h1>基于AI的系统研究</h1>",
  "<h2>摘要</h2>",
  "<p>本文研究了<strong>排版</strong>。</p>",
  "<p>关键词：AI；排版</p>",
  '<h1><a id="_Toc1"></a>一、引言</h1>',
  "<p>正文 &amp; 内容&lt;1&gt;&#12290;</p>",
  "<ul><li>要点一</li><li>要点二</li></ul>",
  "<ol><li>第一点</li><li><p>第二点</p></li></ol>",
  "<table><tr><td><p>模块</p></td><td><p>功能</p></td></tr><tr><td><p>A|B</p></td><td><p>清洗</p><p>识别</p></td></tr></table>",
  "<h3>小节</h3>",
  "<h4>四级标题</h4>",
  "<p>行一<br />行二</p>",
  '<p><img src="data:image/png;base64,AAAA" /></p>',
].join("");

test("docxHtmlToText：标题转 #，列表转 - 和 1.，表格转 Markdown 表格", () => {
  assert.equal(
    docxHtmlToText(MAMMOTH_HTML),
    [
      "# 基于AI的系统研究",
      "## 摘要",
      "本文研究了排版。",
      "关键词：AI；排版",
      "# 一、引言",
      "正文 & 内容<1>。",
      "- 要点一",
      "- 要点二",
      "1. 第一点",
      "2. 第二点",
      "| 模块 | 功能 |",
      "| --- | --- |",
      "| A｜B | 清洗 识别 |",
      "### 小节",
      "四级标题",
      "行一",
      "行二",
    ].join("\n")
  );
});

test(".docx 转出来的文本能识别出题目、摘要、章节和表格", () => {
  const out = normalizeText(applyInputFallbacks(docxHtmlToText(MAMMOTH_HTML))).split("\n");
  assert.equal(out[0], "[META] 论文题目：基于AI的系统研究");
  assert.ok(out.includes("[ABSTRACT]"));
  assert.ok(out.includes("[H1] 引言"));
  assert.ok(out.includes("[TABLE] | 模块 | 功能 |"));
});

test("docxHtmlToText：空标题、空列表项的前缀不带到下一行", () => {
  assert.equal(docxHtmlToText("<h1></h1><p>正文</p><ul><li></li></ul><p>下一段</p>"), "正文\n下一段");
});
