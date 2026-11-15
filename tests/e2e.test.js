import { test } from "node:test";
import assert from "node:assert/strict";
import { Packer } from "docx";
import JSZip from "jszip";
import { normalizeText } from "../src/utils/cleaner.js";
import { applyInputFallbacks, parseMeta } from "../src/utils/paper.js";
import { DEFAULT_STYLE } from "../src/utils/templateRules.js";
import { buildPaperDocument } from "../src/utils/wordExport.js";

// 综合 AI 输出：包含问题 2–7 的各种写法
const AI_OUTPUT = `# 基于规则识别的论文自动排版系统研究

**摘要：**本文针对 AI 生成论文文本格式混乱的问题，设计并实现了一种基于规则识别的论文自动排版系统，能够自动识别标题、摘要和参考文献。
**关键词：**论文排版；规则识别；Word 生成
Abstract: This paper designs a rule-based formatting system for AI-generated theses.
Key words: formatting; rule recognition

## 一、引言
近年来，*生成式人工智能*被广泛用于论文写作，详见[相关报告](https://example.com/report)。
[1]指出，规则方法在排版中效果较好。
3.5倍的效率提升来自于自动化。
1. 第一点
2. 第二点
- 项目符号要点

## 二、系统设计
### （一）总体架构
图1展示了系统的整体架构，包括三个模块。
图1 系统整体架构
表1 模块说明
| 模块 | 功能 |
| --- | --- |
| \`cleaner.js\` | 规则识别 |
| **wordExport.js** | 生成 Word |
y = ax + b

---

## 三、结论
本文实现了论文自动排版。

## 参考文献
[1] 张三. 论文排版方法研究[J]. 计算机学报, 2020.
[2] Li K. Rule based formatting[M]. Beijing: Press, 2021.

## 致谢
感谢导师的悉心指导。

## 附录A 调查问卷
问卷共 10 题。`;

function paragraphs(xml) {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([p]) => ({
    style: (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "",
    text: [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""),
  }));
}

async function exportDocx(scheme) {
  const cleaned = normalizeText(applyInputFallbacks(AI_OUTPUT));
  const { doc } = buildPaperDocument(cleaned, parseMeta(cleaned), DEFAULT_STYLE, { numbering: scheme });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file("word/document.xml").async("string");
  // 目录域里的缓存条目不算正文
  return { cleaned, paras: paragraphs(xml).filter((p) => !p.style.startsWith("TOC")) };
}

test("端到端：综合 AI 输出的中间标签", async () => {
  const { cleaned } = await exportDocx("cn");
  const lines = cleaned.split("\n").filter(Boolean);
  for (const expected of [
    "[META] 论文题目：基于规则识别的论文自动排版系统研究",
    "[ABSTRACT]",
    "[KEYWORDS] 论文排版；规则识别；Word 生成",
    "[ABSTRACT_EN]",
    "[KEYWORDS_EN] formatting; rule recognition",
    "[H1] 引言",
    "[H2] 总体架构",
    "[FIGURE_CAPTION] 图1 系统整体架构",
    "[TABLE_CAPTION] 表1 模块说明",
    "[FORMULA] y = ax + b",
    "[REFERENCES]",
    "[ACKNOWLEDGEMENTS]",
    "[APPENDIX] 附录A 调查问卷",
  ]) {
    assert.ok(lines.includes(expected), expected);
  }
  assert.equal(lines.filter((l) => l === "[ABSTRACT]").length, 1, "摘要只出现一次");
  assert.equal(lines.filter((l) => l.startsWith("[REF] ")).length, 2, "正文里的 [1]指出 不算参考文献");
  assert.equal(lines.filter((l) => l.startsWith("[FIGURE_CAPTION] ")).length, 1, "图1展示了…… 不算图题");
});

test("端到端：导出的 Word 标题样式、后置部分、列表序号、无 Markdown 残留（cn 编号）", async () => {
  const { paras } = await exportDocx("cn");
  const styled = (style) => paras.filter((p) => p.style === style).map((p) => p.text);

  assert.deepEqual(styled("Heading1"), ["一、引言", "二、系统设计", "三、结论", "参考文献", "致谢", "附录A 调查问卷"]);
  assert.deepEqual(styled("Heading2"), ["（一）总体架构"]);

  const texts = paras.map((p) => p.text);
  assert.ok(texts.includes("（1）第一点") && texts.includes("（2）第二点"), "列表保留序号");
  assert.ok(texts.includes("项目符号要点"), "项目符号去掉");
  assert.ok(texts.includes("3.5倍的效率提升来自于自动化。"), "小数开头原样保留");
  assert.ok(texts.includes("[1]指出，规则方法在排版中效果较好。"), "正文引用留在正文");
  assert.ok(texts.includes("近年来，生成式人工智能被广泛用于论文写作，详见相关报告。"), "行内 Markdown 清理干净");
  assert.ok(texts.includes("cleaner.js") && texts.includes("wordExport.js"), "表格单元格去掉代码和加粗符号");
  assert.ok(texts.includes("[1] 张三. 论文排版方法研究[J]. 计算机学报, 2020."));
  assert.ok(texts.includes("[2] Li K. Rule based formatting[M]. Beijing: Press, 2021."));
  assert.ok(texts.some((t) => t.startsWith("摘　要：本文针对")), "行内摘要不重复「摘要：」");
  assert.ok(!texts.some((t) => t.includes("摘要：摘要") || t.includes("摘　要：摘要")));

  for (const leftover of ["#", "**", "`", "](", "---"]) {
    assert.ok(!texts.some((t) => t.includes(leftover)), `没有残留 ${leftover}`);
  }
});

test("端到端：arabic 编号方案", async () => {
  const { paras } = await exportDocx("arabic");
  const heading1 = paras.filter((p) => p.style === "Heading1").map((p) => p.text);
  assert.deepEqual(heading1, ["1 引言", "2 系统设计", "3 结论", "参考文献", "致谢", "附录A 调查问卷"]);
  assert.ok(paras.some((p) => p.style === "Heading2" && p.text === "2.1 总体架构"));
  assert.ok(paras.some((p) => p.text === "(1) 第一点"));
});
