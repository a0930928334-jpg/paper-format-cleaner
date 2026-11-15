import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfItemsToText, reflowLines } from "../src/utils/fileText.js";

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
