const SIZE_RULES = [
  { pattern: /小四/, key: "bodySize", value: 24, label: "正文字号小四" },
  { pattern: /四号/, key: "bodySize", value: 28, label: "正文字号四号" },
  { pattern: /小三/, key: "headingSize", value: 30, label: "标题字号小三" },
  { pattern: /三号/, key: "headingSize", value: 32, label: "标题字号三号" },
];

/**
 * Reads only rules that are explicitly written in a template instruction file.
 * This deliberately does not claim to inspect DOCX/PDF internal visual styles.
 */
export function analyzeTemplateText(text, fileName = "") {
  const content = String(text || "");
  const schoolMatch = content.includes("浙江工商大学")
    ? ["浙江工商大学"]
    : content.match(/[\u4e00-\u9fa5]{2,20}(?:大学|学院)/);
  const school = schoolMatch?.[0] || "";
  const styleUpdates = {};
  const rules = [];

  if (content.includes("宋体")) {
    styleUpdates.bodyFont = "SimSun";
    rules.push("正文使用宋体");
  }
  if (content.includes("黑体")) {
    styleUpdates.headingFont = "SimHei";
    rules.push("标题使用黑体");
  }
  if (/Times New Roman/i.test(content)) {
    styleUpdates.englishFont = "Times New Roman";
    rules.push("英文使用 Times New Roman");
  }

  for (const rule of SIZE_RULES) {
    if (rule.pattern.test(content)) {
      styleUpdates[rule.key] = rule.value;
      rules.push(rule.label);
    }
  }

  if (/1\.5\s*倍?(?:行距)?/.test(content)) {
    styleUpdates.lineSpacing = 360;
    rules.push("1.5 倍行距");
  }

  if (/首行缩进\s*(?:2|二)\s*(?:个)?字符|缩进\s*(?:2|二)\s*(?:个)?字符/.test(content)) {
    styleUpdates.firstLineIndent = 420;
    rules.push("首行缩进 2 字符");
  }

  const summary = [
    fileName ? `检测文件：${fileName}` : "",
    school ? `识别学校：${school}` : "未识别到明确学校名称",
    rules.length ? `明确规则：${rules.join("、")}` : "未发现明确写出的格式规则",
  ].filter(Boolean);

  return {
    school,
    styleUpdates,
    appliedRuleCount: Object.keys(styleUpdates).length,
    rulesText: summary.join("；"),
  };
}
