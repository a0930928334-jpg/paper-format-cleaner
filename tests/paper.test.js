import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../src/utils/cleaner.js";
import {
  applyInputFallbacks,
  analyzeDocumentMode,
  buildPreviewInfo,
  buildQualityChecks,
  mergeMeta,
  parseMeta,
  safeFileName,
} from "../src/utils/paper.js";
import { analyzeTemplateText, DEFAULT_STYLE } from "../src/utils/templateRules.js";

test("缺题目和摘要时自动补上", () => {
  const raw = "人工智能与论文写作\n这是一段足够长的正文内容，用来模拟 AI 直接输出的第一段摘要文字，长度超过四十个字没有问题。\n一、引言\n正文";
  const lines = applyInputFallbacks(raw).split("\n");
  assert.equal(lines[0], "论文题目：人工智能与论文写作");
  assert.equal(lines[1], "摘要");
  assert.equal(lines[3], "关键词：");
});

test("不像论文的文本原样保留", () => {
  const raw = "Dear Hiring Manager,\nI am writing to apply.";
  assert.equal(applyInputFallbacks(raw), raw);
  assert.equal(analyzeDocumentMode(raw, normalizeText(raw)), "普通文档模式");
});

test("解析封面信息，手动填写优先", () => {
  const meta = parseMeta(normalizeText("学校：某某大学\n论文题目：题目甲\n姓名：张三"));
  assert.equal(meta.school, "某某大学");
  assert.equal(meta.title, "题目甲");
  const merged = mergeMeta({ title: "  手动题目  ", name: "" }, meta);
  assert.equal(merged.title, "手动题目");
  assert.equal(merged.name, "张三");
});

test("导出前检查能指出缺失的部分", () => {
  const cleaned = normalizeText(applyInputFallbacks("论文题目：甲\n摘要\n内容\n关键词：\n一、引言\n正文"));
  const info = buildPreviewInfo(cleaned, parseMeta(cleaned));
  const checks = buildQualityChecks(cleaned, "中文论文模式", info);
  const warns = checks.filter((c) => c.type === "warn").map((c) => c.text);
  assert.ok(warns.some((t) => t.includes("关键词")));
  assert.ok(warns.some((t) => t.includes("参考文献")));
  assert.ok(checks.some((c) => c.type === "ok" && c.text.includes("1 个一级标题")));
});

test("文件名去掉非法字符", () => {
  assert.equal(safeFileName('a/b:c*?"<>|d'), "abcd");
  assert.equal(safeFileName("   "), "论文");
});

test("模板识别：小四不会被误认成四号", () => {
  const { style, school } = analyzeTemplateText("浙江工商大学本科毕业论文格式要求：正文宋体小四号，一级标题黑体三号，1.5倍行距，首行缩进2字符");
  assert.equal(school, "浙江工商大学");
  assert.equal(style.bodySize, 24);
  assert.equal(style.headingSize, 32);
  assert.equal(style.headingFont, "SimHei");
  assert.equal(style.lineSpacing, 360);
  assert.equal(style.firstLineIndent, 480);
});

test("模板里找不到的参数沿用默认值", () => {
  const { style } = analyzeTemplateText("没有任何格式说明");
  assert.deepEqual(style, DEFAULT_STYLE);
});
