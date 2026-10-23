/**
 * 论文结构相关的纯函数：封面信息解析、输入兜底、文档模式判断和导出前检查。
 * 这些函数不依赖浏览器或 React，可以直接用 node --test 测试。
 */

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
  const hasPaperSignal =
    /摘要|关键词|Abstract|Keywords|参考文献|引言|文献综述|研究背景|系统设计|结论/.test(text) ||
    /^[一二三四五六七八九十][、.\s]/m.test(text);

  if (!hasPaperSignal) return text;

  const hasTitle = lines.some((line) => /^(论文题目|题目)[:：]/.test(line));
  const hasAbstract = lines.some((line) => /^摘\s*要\s*[:：]?$/.test(line));
  const hasKeywords = lines.some((line) => /^关\s*键\s*词/.test(line));

  if (!hasTitle && lines.length > 0) {
    const first = lines[0];
    if (first.length <= 80 && !META_LINE.test(first) && !/^(摘\s*要|关\s*键\s*词|Abstract)/i.test(first) && !CHAPTER_LINE.test(first)) {
      lines[0] = `论文题目：${first}`;
    }
  }

  if (!hasAbstract) {
    const firstLongIndex = lines.findIndex(
      (line) =>
        line.length >= 40 &&
        !META_LINE.test(line) &&
        !CHAPTER_LINE.test(line) &&
        !/^参考文献/.test(line)
    );

    if (firstLongIndex !== -1) {
      lines.splice(firstLongIndex, 0, "摘要");
      if (!hasKeywords) lines.splice(firstLongIndex + 2, 0, "关键词：");
    } else {
      lines.splice(1, 0, "摘要", "请填写摘要内容。", "关键词：");
    }
  } else if (!hasKeywords) {
    const abstractIndex = lines.findIndex((line) => /^摘\s*要\s*[:：]?$/.test(line));
    lines.splice(abstractIndex + 2, 0, "关键词：");
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
