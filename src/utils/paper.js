/**
 * 论文结构相关的纯函数：封面信息解析、输入兜底、文档模式判断和导出前检查。
 * 这些函数不依赖浏览器或 React，可以直接用 node --test 测试。
 */
import { inlineSection, keywordsOf, normalizeText, sectionKeyword } from "./cleaner.js";

export const DEFAULT_SCHOOL = "浙江工商大学";
export const UNTITLED = "未命名论文";
export const BLANK_DATE = "二○   年     月";

const META_FIELDS = [
  ["school", /^(学校|院校)[:：]\s*/],
  ["title", /^(论文题目|题目)[:：]\s*/],
  ["englishTitle", /^(英文题目|英文标题)[:：]\s*/],
  ["major", /^专业[:：]\s*/],
  ["className", /^班级[:：]\s*/],
  ["studentId", /^学号[:：]\s*/],
  ["name", /^姓名[:：]\s*/],
  ["date", /^日期[:：]\s*/],
];

export function parseMeta(cleaned) {
  const meta = {
    school: DEFAULT_SCHOOL,
    title: UNTITLED,
    englishTitle: "",
    major: "",
    className: "",
    studentId: "",
    name: "",
    date: BLANK_DATE,
  };

  for (const raw of cleaned.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("[META] ")) continue;
    const content = line.slice("[META] ".length);
    for (const [key, re] of META_FIELDS) {
      if (re.test(content)) {
        const value = content.replace(re, "").trim();
        if (value) meta[key] = value;
        break;
      }
    }
  }

  return meta;
}

/** 手动填写的封面信息优先，没填的字段用自动识别结果。 */
export function mergeMeta(manual, auto) {
  const out = {};
  for (const key of Object.keys(auto)) {
    const value = typeof manual?.[key] === "string" ? manual[key].trim() : "";
    out[key] = value || auto[key];
  }
  return out;
}

export function parseMarkdownTableRow(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const META_LINE = /^(论文题目|题目|英文题目|英文标题|学校|院校|专业|班级|学号|姓名|日期)[:：]/;
const CHAPTER_LINE = /^[一二三四五六七八九十]+[、.．\s]/;

/**
 * 判断文本是不是论文：用识别规则跑一遍，至少命中两类信号
 * （摘要、关键词、参考文献、章节标题），或者有两个以上一级标题。
 * 只出现「结论」「引言」这类词不算。
 */
export function looksLikePaper(text) {
  const tagged = normalizeText(text).split("\n");
  const has = (re) => tagged.some((line) => re.test(line));
  const signals = [/^\[ABSTRACT(_EN)?\]$/, /^\[KEYWORDS(_EN)?\]/, /^\[REFERENCES\]$/, /^\[H[123]\] /].filter(has).length;
  const chapters = tagged.filter((line) => line.startsWith("[H1] ")).length;
  return signals >= 2 || chapters >= 2;
}

/**
 * AI 文本经常缺题目、摘要或关键词。看起来像论文时，补上占位，
 * 让后续的结构识别和 Word 导出不至于整体错位。
 */
export function applyInputFallbacks(rawText) {
  const lines = String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .filter((line) => line.toLowerCase() !== "documents:");

  const text = lines.join("\n");
  if (!looksLikePaper(text)) return text;

  const isInlineAbstract = (line) => inlineSection(line)?.kind === "abstract";
  const isAbstractStart = (line) => sectionKeyword(line) === "abstract" || isInlineAbstract(line);
  const hasTitle = lines.some((line) => /^(论文题目|题目)[:：]/.test(line));
  const hasAbstract = lines.some(isAbstractStart);
  const hasKeywords = lines.some((line) => keywordsOf(line)?.lang === "cn");

  // 第一行是「# 题目」时去掉 #；「## xxx」更像章节，不当题目
  if (!hasTitle && lines.length > 0 && !/^#{2,}/.test(lines[0])) {
    const first = lines[0].replace(/^#\s+/, "");
    if (
      first.length <= 80 &&
      !META_LINE.test(first) &&
      !sectionKeyword(first) &&
      !keywordsOf(first) &&
      !/^(摘\s*要|Abstract)/i.test(first) &&
      !CHAPTER_LINE.test(first)
    ) {
      lines[0] = `论文题目：${first}`;
    }
  }

  if (!hasAbstract) {
    const firstLongIndex = lines.findIndex(
      (line) =>
        line.length >= 40 &&
        !META_LINE.test(line) &&
        !CHAPTER_LINE.test(line) &&
        !/^#/.test(line) &&
        !sectionKeyword(line)
    );

    if (firstLongIndex !== -1) {
      lines.splice(firstLongIndex, 0, "摘要");
      if (!hasKeywords) lines.splice(firstLongIndex + 2, 0, "关键词：");
    } else {
      lines.splice(1, 0, "摘要", "请填写摘要内容。", "关键词：");
    }
  } else if (!hasKeywords) {
    const abstractIndex = lines.findIndex(isAbstractStart);
    // 行内摘要本身就是摘要正文，关键词紧跟其后
    lines.splice(abstractIndex + (isInlineAbstract(lines[abstractIndex]) ? 1 : 2), 0, "关键词：");
  }

  return lines.join("\n");
}

export function hasPaperStructure(cleaned) {
  return ["[ABSTRACT]", "[H1]", "[REFERENCES]", "[KEYWORDS]"].some((tag) => cleaned.includes(tag));
}

export function analyzeDocumentMode(text, cleaned) {
  if (!hasPaperStructure(cleaned)) return "普通文档模式";
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const chineseChars = (text.match(/[一-龥]/g) || []).length;
  return englishChars > chineseChars ? "英文论文模式" : "中文论文模式";
}

export function buildPreviewInfo(cleaned, meta) {
  const lines = cleaned.split("\n").map((line) => line.trim());
  return {
    title: meta.title || "未识别到标题",
    hasAbstract: lines.includes("[ABSTRACT]"),
    hasKeywords: lines.some((line) => line.startsWith("[KEYWORDS] ") && line.length > "[KEYWORDS] ".length),
    chapters: lines.filter((line) => line.startsWith("[H1] ")).map((line) => line.slice(5)),
    sections: lines.filter((line) => line.startsWith("[H2] ")).map((line) => line.slice(5)),
    references: lines.filter((line) => line.startsWith("[REF] ")).length,
  };
}

// 正文引用：[1]、[1,3]、[2-4]；[ 前面紧挨字母数字的（如 a[2]）是数组下标，不算
const CITATION = /(^|[^A-Za-z0-9_\]])\[(\d{1,3}(?:\s*[-–~～,，、]\s*\d{1,3})*)\]/g;

function citedNumbers(group) {
  const out = [];
  for (const part of group.split(/\s*[,，、]\s*/)) {
    const [a, b] = part.split(/\s*[-–~～]\s*/).map(Number);
    if (b && b >= a && b - a <= 50) for (let n = a; n <= b; n++) out.push(n);
    else out.push(a);
  }
  return out.filter((n) => n >= 1);
}

/** 正文里的 [n] 引用和参考文献条目对一下：引用了不存在的编号、没被引用的条目。 */
export function citationCheck(cleaned) {
  const lines = cleaned.split("\n").map((line) => line.trim());
  const refCount = lines.filter((line) => line.startsWith("[REF] ")).length;
  const cited = new Set();
  for (const line of lines) {
    if (!line || /^\[[A-Z][A-Z0-9_]*\]/.test(line)) continue; // 只看正文段落
    for (const m of line.matchAll(CITATION)) citedNumbers(m[2]).forEach((n) => cited.add(n));
  }
  const sorted = [...cited].sort((a, b) => a - b);
  return {
    cited: sorted,
    missing: sorted.filter((n) => n > refCount),
    uncited: Array.from({ length: refCount }, (_, i) => i + 1).filter((n) => !cited.has(n)),
  };
}

const listNumbers = (nums) => nums.slice(0, 8).map((n) => `[${n}]`).join("、") + (nums.length > 8 ? " 等" : "");

function citationItems(cleaned) {
  const { cited, missing, uncited } = citationCheck(cleaned);
  if (!cited.length) return []; // 正文没有引用标注时不提示，很多 AI 文本本来就不标
  if (missing.length) return [{ type: "warn", text: `正文引用了不存在的参考文献 ${listNumbers(missing)}` }];
  if (uncited.length) return [{ type: "warn", text: `有 ${uncited.length} 条参考文献正文没有引用：${listNumbers(uncited)}` }];
  return [{ type: "ok", text: "正文引用与参考文献编号一致" }];
}

export function buildQualityChecks(cleaned, mode, info) {
  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const check = (ok, okText, warnText) => ({ type: ok ? "ok" : "warn", text: ok ? okText : warnText });

  if (!mode.includes("论文")) {
    return [
      { type: "ok", text: "当前为普通文档模式，将按干净文档格式导出" },
      check(lines.length > 3, "已识别到正文内容", "正文内容较少，请确认是否完整"),
    ];
  }

  return [
    check(info.title && info.title !== UNTITLED, "已识别论文题目", "未识别到论文题目，请在封面信息里填写"),
    check(info.hasAbstract, "已识别摘要", "未识别到摘要，系统已补占位"),
    check(info.hasKeywords, "已识别关键词", "未识别到关键词，导出后请补充"),
    check(info.chapters.length > 0, `已识别 ${info.chapters.length} 个一级标题`, "未识别到一级标题，可能会按普通正文导出"),
    check(info.references > 0, `已识别 ${info.references} 条参考文献`, "未识别到参考文献，可以继续导出"),
    ...citationItems(cleaned),
  ];
}

/** 去掉文件名里 Windows / macOS 不允许的字符。 */
export function safeFileName(name, fallback = "论文") {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|\n\r\t]/g, "")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}
