import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStructure, normalizeText, sectionKeyword, stripInlineMarkdown, toHtml } from "../src/utils/cleaner.js";
import { applyInputFallbacks } from "../src/utils/paper.js";
import { parsePaper } from "../src/utils/wordExport.js";

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

/* ---------- 问题 3：行内摘要 ---------- */

const LONG_ABSTRACT = "本文研究了人工智能在论文排版中的应用，提出了一种基于规则的结构识别方法，并实现了完整的系统。";

test("行内写法「摘要：……」拆成摘要标题和摘要正文，不再重复补摘要", () => {
  const input = `摘要：${LONG_ABSTRACT}\n关键词：AI；排版\n一、引言\n正文。`;
  assert.ok(!applyInputFallbacks(input).split("\n").includes("摘要"), "兜底不再插入摘要占位");
  assert.deepEqual(pipeline(input), ["[ABSTRACT]", LONG_ABSTRACT, "[KEYWORDS] AI；排版", "[H1] 引言", "正文。"]);
});

test("行内写法「Abstract: ……」拆成英文摘要", () => {
  assert.deepEqual(tags("Abstract: This paper designs a formatting system."), ["[ABSTRACT_EN]", "This paper designs a formatting system."]);
  assert.deepEqual(tags("**摘要**：本文研究了排版。"), ["[ABSTRACT]", "本文研究了排版。"]);
  assert.deepEqual(tags("【摘要】本文研究了排版。"), ["[ABSTRACT]", "本文研究了排版。"]);
});

test("行内摘要缺关键词时，关键词占位补在摘要正文后面", () => {
  const lines = applyInputFallbacks(`论文题目：甲\n摘要：${LONG_ABSTRACT}\n一、引言\n正文\n二、结论\n正文`).split("\n");
  assert.deepEqual(lines.slice(1, 3), [`摘要：${LONG_ABSTRACT}`, "关键词："]);
});

test("冒号后面没内容、或者没有冒号的「摘要……」正文不拆分", () => {
  assert.deepEqual(tags("一、引言\n摘要生成算法是本文的研究重点。"), ["[H1] 引言", "摘要生成算法是本文的研究重点。"]);
  assert.deepEqual(tags("摘要："), ["[ABSTRACT]"]);
});

/* ---------- 问题 4：正文行被误判 ---------- */

test("正文里的引用、图表说明、带等号的英文句子、以关键词开头的句子保持为正文", () => {
  const bodyLines = [
    "[1]指出，规则方法在排版中效果较好。",
    "图1展示了系统的整体架构，包括三个模块。",
    "表2列出了各模型的准确率。",
    "The accuracy was 95% (n = 200) on the test set",
    "关键词提取是自然语言处理的基础任务。",
    "Keyword extraction is a basic NLP task.",
  ];
  for (const line of bodyLines) {
    assert.deepEqual(tags(`一、引言\n${line}`), ["[H1] 引言", line], line);
  }
});

test("真正的图表题、公式和参考文献条目保持原来的识别结果", () => {
  assert.deepEqual(tags("图1 系统整体流程示意图"), ["[FIGURE_CAPTION] 图1 系统整体流程示意图"]);
  assert.deepEqual(tags("表1 结果"), ["[TABLE_CAPTION] 表1 结果"]);
  assert.deepEqual(tags("图 3-2 模块关系"), ["[FIGURE_CAPTION] 图 3-2 模块关系"]);
  assert.deepEqual(tags("表1.2 实验参数"), ["[TABLE_CAPTION] 表1.2 实验参数"]);
  assert.deepEqual(tags("y = ax + b"), ["[FORMULA] y = ax + b"]);
  assert.deepEqual(tags("公式：E = mc^2"), ["[FORMULA] E = mc^2"]);
  assert.deepEqual(tags("loss = -sum(y * log(p))"), ["[FORMULA] loss = -sum(y * log(p))"]);
  assert.deepEqual(tags("一、引言\n[1] 张三. 论文排版[J]. 计算机学报, 2020."), ["[H1] 引言", "[REF] 张三. 论文排版[J]. 计算机学报, 2020."]);
  assert.deepEqual(tags("[2] Smith J. Paper formatting. Springer, 2019"), ["[REF] Smith J. Paper formatting. Springer, 2019"]);
});

test("关键词行必须带冒号或者整行只有这个词", () => {
  assert.deepEqual(tags("关键词"), ["[KEYWORDS]"]);
  assert.deepEqual(tags("Keywords: AI"), ["[KEYWORDS_EN] AI"]);
  assert.deepEqual(tags("关键词: AI"), ["[KEYWORDS] AI"]);
});

/* ---------- 问题 5：参考文献后面的致谢、附录 ---------- */

const BACK_MATTER = "参考文献\n[1] 张三. 文献[J]. 2020.\n致谢\n感谢导师的指导。\n附录A 调查问卷\n问卷内容……";

test("致谢、附录结束参考文献区，各自输出标签", () => {
  assert.deepEqual(tags(BACK_MATTER), [
    "[REFERENCES]",
    "[REF] 张三. 文献[J]. 2020.",
    "[ACKNOWLEDGEMENTS]",
    "感谢导师的指导。",
    "[APPENDIX] 附录A 调查问卷",
    "问卷内容……",
  ]);
});

test("参考文献后面出现一级标题，参考文献区也结束", () => {
  assert.deepEqual(tags("参考文献\n[1] 张三. 文献[J]. 2020.\n# 结论\n正文。"), ["[REFERENCES]", "[REF] 张三. 文献[J]. 2020.", "[H1] 结论", "正文。"]);
});

test("结构识别结果和预览都支持致谢、附录", () => {
  const cleaned = normalizeText(BACK_MATTER);
  const types = extractStructure(cleaned).map((x) => x.type);
  assert.deepEqual(types, ["参考文献标题", "参考文献条目", "致谢标题", "正文", "附录标题", "正文"]);
  const html = toHtml(cleaned);
  assert.ok(html.includes('<h2 class="section-title">致谢</h2>'));
  assert.ok(html.includes('<h2 class="section-title">附录A 调查问卷</h2>'));
  assert.ok(html.includes('<p class="body-para">感谢导师的指导。</p>'), "致谢正文不是参考文献条目");
});

/* ---------- 问题 6：正文开头的数字 ---------- */

const LIST_INPUT = "一、引言\n3.5倍的效率提升来自于自动化。\n3.5 倍的效率提升来自于自动化。\n2024.5 月份数据\n1. 第一点\n2、第二点\n3）第三点\n4.第四点\n- 要点\n• 另一个要点";
const paragraphTexts = (scheme) =>
  parsePaper(normalizeText(LIST_INPUT), scheme).body.filter((b) => b.type === "paragraph").map((b) => b.text);

test("小数、年份开头的正文原样保留，不当标题也不删数字", () => {
  assert.deepEqual(paragraphTexts("cn").slice(0, 3), ["3.5倍的效率提升来自于自动化。", "3.5 倍的效率提升来自于自动化。", "2024.5 月份数据"]);
});

test("列表项保留序号：cn 方案用（1），arabic 方案用 (1)，项目符号去掉", () => {
  assert.deepEqual(paragraphTexts("cn").slice(3), ["（1）第一点", "（2）第二点", "（3）第三点", "（4）第四点", "要点", "另一个要点"]);
  assert.deepEqual(paragraphTexts("arabic").slice(3, 7), ["(1) 第一点", "(2) 第二点", "(3) 第三点", "(4) 第四点"]);
});

test("网页预览的列表序号和 Word 一致", () => {
  const cleaned = normalizeText(LIST_INPUT);
  const cn = toHtml(cleaned, { numbering: "cn" });
  assert.ok(cn.includes('<p class="list-item">（1）第一点</p>'));
  assert.ok(cn.includes('<p class="list-item">（4）第四点</p>'));
  assert.ok(cn.includes('<p class="body-para">2024.5 月份数据</p>'));
  assert.ok(toHtml(cleaned, { numbering: "arabic" }).includes('<p class="list-item">(1) 第一点</p>'));
  assert.equal(extractStructure(cleaned).filter((x) => x.type === "编号列表").length, 4);
});

/* ---------- 问题 7：行内 Markdown ---------- */

test("stripInlineMarkdown 去掉加粗、斜体、代码、删除线、链接、图片、引用和分隔线", () => {
  const cases = [
    ["这是**重点**内容", "这是重点内容"],
    ["这是__重点__内容", "这是重点内容"],
    ["这是*斜体*文字", "这是斜体文字"],
    ["这是_斜体_文字", "这是斜体文字"],
    ["运行 `npm test` 即可", "运行 npm test 即可"],
    ["~~删掉~~保留", "删掉保留"],
    ["详见[官方文档](https://example.com/docs)。", "详见官方文档。"],
    ["![架构图](https://example.com/a.png)", ""],
    ["> 引用的一段话", "引用的一段话"],
    ["---", ""],
    ["***", ""],
    ["第一行<br>第二行", "第一行\n第二行"],
    ["| 第一行<br>第二行 | 值 |", "| 第一行 第二行 | 值 |"],
    ["**关键词：**AI", "关键词：AI"],
  ];
  for (const [input, expected] of cases) assert.equal(stripInlineMarkdown(input), expected, input);
});

test("斜体规则不误伤乘号、变量名和文件名", () => {
  for (const text of ["y = a * b * c", "a*b*c", "file_name_v2.py", "snake_case_var", "x**2 + y**2", "loss = -sum(y * log(p))"]) {
    assert.equal(stripInlineMarkdown(text), text);
  }
});

test("normalizeText 清理行内 Markdown，* 项目符号统一成 -", () => {
  assert.deepEqual(tags("一、引言\n这是*斜体*和`代码`，详见[链接](https://a.com)。\n---\n* 要点一"), ["[H1] 引言", "这是斜体和代码，详见链接。", "- 要点一"]);
});

/* ---------- 问题 9：孤立的三级标题 ---------- */

test("前面没有二级标题的三级标题提升为二级标题，arabic 方案不再出现 1.0.1", () => {
  const cleaned = normalizeText("一、引言\n1.1.1 研究背景\n（一）研究方法\n1.1.1 数据来源\n二、实验\n1.2.1 实验设置");
  assert.deepEqual(cleaned.split("\n"), ["[H1] 引言", "[H2] 研究背景", "[H2] 研究方法", "[H3] 数据来源", "[H1] 实验", "[H2] 实验设置"]);
  const labels = parsePaper(cleaned, "arabic").body.map((b) => b.label);
  assert.deepEqual(labels, ["1", "1.1", "1.2", "1.2.1", "2", "2.1"]);
});

/* ---------- 问题 12：英文和理工科的一级标题写法 ---------- */

test("「1 引言」「2 Related Work」按连续编号识别为一级标题", () => {
  assert.deepEqual(tags("1 引言\n正文。\n1.1 研究背景\n2 Related Work\n正文。\n3 系统设计"), [
    "[H1] 引言",
    "正文。",
    "[H2] 研究背景",
    "[H1] Related Work",
    "正文。",
    "[H1] 系统设计",
  ]);
});

test("「Chapter 1 Introduction」识别为一级标题", () => {
  assert.deepEqual(tags("Chapter 1 Introduction\nChapter 2: Related Work"), ["[H1] Introduction", "[H1] Related Work"]);
});

test("数字开头的正文不当一级标题：编号不连续、量词、年份、句子", () => {
  assert.deepEqual(tags("一、引言\n3 个模块分别承担数据清洗、识别和导出。"), ["[H1] 引言", "3 个模块分别承担数据清洗、识别和导出。"]);
  assert.deepEqual(tags("一、引言\n3 个模块分别承担清洗识别导出"), ["[H1] 引言", "3 个模块分别承担清洗识别导出"]);
  assert.deepEqual(tags("2024 年数据显示，用户增长明显。"), ["2024 年数据显示，用户增长明显。"]);
  assert.deepEqual(tags("2 Related Work"), ["2 Related Work"], "第一个必须是 1");
  assert.deepEqual(tags("1 引言\n3 系统设计"), ["[H1] 引言", "3 系统设计"], "跳号不算");
  assert.deepEqual(tags("1 引言\n2 We propose a new method."), ["[H1] 引言", "2 We propose a new method."], "带句号的是句子");
});
