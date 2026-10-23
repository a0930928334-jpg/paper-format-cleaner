import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, extractStructure } from "../src/utils/cleaner.js";

const tags = (text) => normalizeText(text).split("\n").filter(Boolean);

test("识别封面信息、摘要和关键词", () => {
  const out = tags("论文题目：测试题目\n摘要\n这是摘要。\n关键词：甲；乙");
  assert.deepEqual(out, ["[META] 论文题目：测试题目", "[ABSTRACT]", "这是摘要。", "[KEYWORDS] 甲；乙"]);
});

test("三种常见标题写法都能识别，并去掉原有编号", () => {
  assert.deepEqual(tags("一、引言"), ["[H1] 引言"]);
  assert.deepEqual(tags("第二章 相关工作"), ["[H1] 相关工作"]);
  assert.deepEqual(tags("# 结论"), ["[H1] 结论"]);
  assert.deepEqual(tags("（一）研究背景"), ["[H2] 研究背景"]);
  assert.deepEqual(tags("1.2 研究方法"), ["[H2] 研究方法"]);
  assert.deepEqual(tags("1.2.3 数据来源"), ["[H3] 数据来源"]);
});

test("参考文献标题之后的每一行都是参考文献，并去掉原编号", () => {
  const out = tags("参考文献\n[1] 张三. 论文A\n李四. 论文B");
  assert.deepEqual(out, ["[REFERENCES]", "[REF] 张三. 论文A", "[REF] 李四. 论文B"]);
});

test("Markdown 表格保留数据行，丢掉分隔行", () => {
  const out = tags("表1 结果\n| 模型 | 准确率 |\n| --- | --- |\n| A | 90% |");
  assert.deepEqual(out, ["[TABLE_CAPTION] 表1 结果", "[TABLE] | 模型 | 准确率 |", "[TABLE] | A | 90% |"]);
});

test("短等式识别为公式，带逗号或很多中文的句子不算", () => {
  assert.deepEqual(tags("y = ax + b"), ["[FORMULA] y = ax + b"]);
  assert.deepEqual(tags("公式：E = mc^2"), ["[FORMULA] E = mc^2"]);
  const sentence = "其中，学习率设为 lr = 0.001";
  assert.deepEqual(tags(sentence), [sentence]);
});

test("清理 Markdown 加粗和全角空格", () => {
  assert.deepEqual(tags("这是**重点**内容　结束"), ["这是重点内容 结束"]);
});

test("extractStructure 给每行标上中文类型", () => {
  const types = extractStructure(normalizeText("摘要\n内容\n一、引言")).map((x) => x.type);
  assert.deepEqual(types, ["摘要标题", "正文", "一级标题"]);
});
