import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, sectionKeyword } from "../src/utils/cleaner.js";
import { applyInputFallbacks } from "../src/utils/paper.js";

const tags = (text) => normalizeText(text).split("\n").filter(Boolean);
const pipeline = (text) => tags(applyInputFallbacks(text));

/* ---------- 问题 2：Markdown / 加粗 / 冒号写法的特殊章节标题 ---------- */

test("Markdown 写法的题目、摘要、参考文献按特殊章节识别，不被编号", () => {
  const input = [
    "# 基于AI的系统研究",
    "## 摘要",
    "本文研究了人工智能在论文排版中的应用，提出了一种规则识别方法，并实现了完整的系统。",
    "关键词：AI；排版",
    "# 一、引言",
    "正文内容。",
    "## 参考文献",
    "[1] 张三. 论文排版[J]. 2020.",
  ].join("\n");
  assert.deepEqual(pipeline(input), [
    "[META] 论文题目：基于AI的系统研究",
    "[ABSTRACT]",
    "本文研究了人工智能在论文排版中的应用，提出了一种规则识别方法，并实现了完整的系统。",
    "[KEYWORDS] AI；排版",
    "[H1] 引言",
    "正文内容。",
    "[REFERENCES]",
    "[REF] 张三. 论文排版[J]. 2020.",
  ]);
});

test("sectionKeyword 兼容 #、加粗、【】、全角空格和行尾冒号", () => {
  const cases = {
    abstract: ["摘要", "摘 要", "摘　要", "中文摘要", "## 摘要", "**摘要**", "**摘要：**", "【摘要】", "摘要：", "__摘要__"],
    abstractEn: ["Abstract", "ABSTRACT", "## Abstract", "**Abstract:**"],
    references: ["参考文献", "References", "REFERENCES", "Bibliography", "## 参考文献", "**参考文献**", "参考文献："],
    acknowledgements: ["致谢", "致 谢", "致　谢", "Acknowledgements", "Acknowledgments", "# 致谢"],
    appendix: ["附录", "Appendix", "附录A 调查问卷", "附录 A", "附录一 访谈提纲", "Appendix A: Questionnaire", "## 附录B"],
  };
  for (const [kind, lines] of Object.entries(cases)) {
    for (const line of lines) assert.equal(sectionKeyword(line), kind, line);
  }
  for (const line of ["摘要生成算法是本文的重点", "参考文献格式要统一", "附录中给出了问卷的全部题目。", "致谢导师", "Abstract classes are useful.", "摘要：本文研究了排版"]) {
    assert.equal(sectionKeyword(line), null, line);
  }
});

test("关键词行兼容加粗、Key words 和全大写写法", () => {
  assert.deepEqual(tags("**关键词：**AI；排版"), ["[KEYWORDS] AI；排版"]);
  assert.deepEqual(tags("Key words: AI; formatting"), ["[KEYWORDS_EN] AI; formatting"]);
  assert.deepEqual(tags("KEYWORDS: AI; formatting"), ["[KEYWORDS_EN] AI; formatting"]);
  assert.deepEqual(tags("【关键词】AI；排版"), ["[KEYWORDS] AI；排版"]);
});

test("兜底补题目时去掉第一行的 #，二级以下的 # 行不当题目", () => {
  assert.equal(applyInputFallbacks("# 论文题目甲\n摘要\n内容\n关键词：甲").split("\n")[0], "论文题目：论文题目甲");
  assert.notEqual(applyInputFallbacks("## 一、引言\n摘要\n内容\n关键词：甲").split("\n")[0], "论文题目：一、引言");
});

test("Markdown 标题里带编号时按编号定级别", () => {
  assert.deepEqual(tags("## 一、引言"), ["[H1] 引言"]);
  assert.deepEqual(tags("## 1. Introduction"), ["[H1] Introduction"]);
  assert.deepEqual(tags("### 1.1 研究背景"), ["[H2] 研究背景"]);
  assert.deepEqual(tags("# 第二章 相关工作"), ["[H1] 相关工作"]);
});

test("题目占用了 # 之后，## 章节整体提升一级", () => {
  assert.deepEqual(tags("## 引言\n### 研究背景\n## 方法"), ["[H1] 引言", "[H2] 研究背景", "[H1] 方法"]);
  assert.deepEqual(tags("# 引言\n## 研究背景"), ["[H1] 引言", "[H2] 研究背景"]);
});
