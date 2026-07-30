export const STRUCTURE_TYPE_OPTIONS = [
  { value: "body", label: "正文" },
  { value: "heading1", label: "一级标题" },
  { value: "heading2", label: "二级标题" },
  { value: "heading3", label: "三级标题" },
  { value: "metadata", label: "封面信息" },
  { value: "abstractTitle", label: "摘要标题" },
  { value: "abstractBody", label: "摘要正文" },
  { value: "keywords", label: "关键词" },
  { value: "abstractEnTitle", label: "英文摘要标题" },
  { value: "abstractEnBody", label: "英文摘要正文" },
  { value: "keywordsEn", label: "英文关键词" },
  { value: "referencesTitle", label: "参考文献标题" },
  { value: "reference", label: "参考文献条目" },
  { value: "tableCaption", label: "表题" },
  { value: "figureCaption", label: "图题" },
  { value: "tableRow", label: "表格行" },
  { value: "formula", label: "公式" },
  { value: "ignore", label: "忽略此行" },
];

const SPECIAL_LINE_TEXT = {
  "[ABSTRACT]": "摘要",
  "[ABSTRACT_EN]": "Abstract",
  "[REFERENCES]": "参考文献",
};

const TAG_PREFIX = /^\[(?:META|KEYWORDS|KEYWORDS_EN|H1|H2|H3|REF|TABLE_CAPTION|FIGURE_CAPTION|TABLE|FORMULA|BODY|ABSTRACT_BODY|ABSTRACT_EN_BODY)\]\s*/;

export function getStructureLineText(line) {
  const trimmed = String(line || "").trim();
  return SPECIAL_LINE_TEXT[trimmed] || trimmed.replace(TAG_PREFIX, "").trim();
}

function formatOverrideLine(type, sourceLine) {
  const text = getStructureLineText(sourceLine);

  switch (type) {
    case "ignore":
      return "";
    case "body":
      return `[BODY] ${text}`;
    case "heading1":
      return `[H1] ${text}`;
    case "heading2":
      return `[H2] ${text}`;
    case "heading3":
      return `[H3] ${text}`;
    case "metadata":
      return `[META] ${text}`;
    case "abstractTitle":
      return "[ABSTRACT]";
    case "abstractBody":
      return `[ABSTRACT_BODY] ${text}`;
    case "keywords":
      return `[KEYWORDS] ${text.replace(/^关键词\s*[:：]?\s*/, "")}`;
    case "abstractEnTitle":
      return "[ABSTRACT_EN]";
    case "abstractEnBody":
      return `[ABSTRACT_EN_BODY] ${text}`;
    case "keywordsEn":
      return `[KEYWORDS_EN] ${text.replace(/^Keywords?\s*[:：]?\s*/i, "")}`;
    case "referencesTitle":
      return "[REFERENCES]";
    case "reference":
      return `[REF] ${text}`;
    case "tableCaption":
      return `[TABLE_CAPTION] ${text}`;
    case "figureCaption":
      return `[FIGURE_CAPTION] ${text}`;
    case "tableRow":
      return `[TABLE] ${text}`;
    case "formula":
      return `[FORMULA] ${text}`;
    default:
      return sourceLine;
  }
}

export function applyStructureOverrides(cleaned, overrides = {}) {
  return String(cleaned || "")
    .split("\n")
    .map((line, index) => {
      const override = overrides[index];
      return override ? formatOverrideLine(override, line) : line;
    })
    .join("\n");
}
