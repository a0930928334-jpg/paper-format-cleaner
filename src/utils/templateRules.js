/**
 * 从学校格式要求文档（Word / PDF 的纯文本）里猜排版参数。
 * 只做保守识别：找不到就沿用默认值，不会把整套格式改乱。
 *
 * 字号单位是 docx 的 half-point（小四 = 12pt = 24），行距单位是 1/240 行。
 */

export const DEFAULT_STYLE = {
  bodyFont: "SimSun",
  headingFont: "SimHei",
  englishFont: "Times New Roman",
  bodySize: 24,
  headingSize: 28,
  smallHeadingSize: 24,
  tableSize: 21,
  lineSpacing: 360,
  paragraphAfter: 120,
  firstLineIndent: 480, // 2 个字符：小四 12pt = 240 twips / 字
};

// 长的名称放前面，避免「小四」被「四号」抢先匹配
const SIZE_NAMES = [
  ["小初", 72], ["初号", 84], ["小一", 48], ["一号", 52], ["小二", 36], ["二号", 44],
  ["小三", 30], ["三号", 32], ["小四", 24], ["四号", 28], ["小五", 18], ["五号", 21],
];

const FONT_NAMES = [
  ["宋体", "SimSun"], ["黑体", "SimHei"], ["楷体", "KaiTi"], ["仿宋", "FangSong"], ["微软雅黑", "Microsoft YaHei"],
];

/** 在片段里找最先出现的名称；同一位置优先取更长的（「小四」优先于「四号」）。 */
function earliest(snippet, table) {
  let best = null;
  for (const [name, value] of table) {
    const i = snippet.indexOf(name);
    if (i === -1) continue;
    if (!best || i < best.i || (i === best.i && name.length > best.len)) best = { i, len: name.length, value };
  }
  return best ? best.value : null;
}

const sizeIn = (snippet) => earliest(snippet, SIZE_NAMES);
const fontIn = (snippet) => earliest(snippet, FONT_NAMES);

/** 取关键词后面一小段文字，用来判断这一项的字体和字号。 */
function windowsAfter(text, keywords, length = 24) {
  const out = [];
  for (const keyword of keywords) {
    let from = 0;
    while (true) {
      const i = text.indexOf(keyword, from);
      if (i === -1) break;
      // 只看到下一个逗号、分号或句号为止，避免读到下一条规则
      out.push(text.slice(i, i + keyword.length + length).split(/[，,；;。]/)[0]);
      from = i + keyword.length;
    }
  }
  return out;
}

function firstMatch(snippets, pick) {
  for (const s of snippets) {
    const value = pick(s);
    if (value) return value;
  }
  return null;
}

export function analyzeTemplateText(text, fileName = "") {
  const content = String(text || "").replace(/\s+/g, " ");
  const style = { ...DEFAULT_STYLE };

  let school = "";
  const schoolMatch = content.match(/[一-龥]{2,16}(大学|学院)/);
  if (schoolMatch) school = schoolMatch[0];

  const body = windowsAfter(content, ["正文"]);
  const h1 = windowsAfter(content, ["一级标题", "章标题", "章名"]);
  const h2 = windowsAfter(content, ["二级标题", "节标题"]);

  style.bodySize = firstMatch(body, sizeIn) ?? style.bodySize;
  style.bodyFont = firstMatch(body, fontIn) ?? style.bodyFont;
  style.headingSize = firstMatch(h1, sizeIn) ?? style.headingSize;
  style.headingFont = firstMatch(h1, fontIn) ?? style.headingFont;
  style.smallHeadingSize = firstMatch(h2, sizeIn) ?? style.smallHeadingSize;

  if (/Times New Roman/i.test(content)) style.englishFont = "Times New Roman";

  const lineMatch = content.match(/(\d(?:\.\d+)?)\s*倍行距/);
  if (lineMatch) style.lineSpacing = Math.round(Number(lineMatch[1]) * 240);
  else if (/单倍行距/.test(content)) style.lineSpacing = 240;

  const indentChars = Number((content.match(/首行缩进\s*(\d)\s*字符/) || [])[1] || 2);
  style.firstLineIndent = indentChars * style.bodySize * 10;

  const sizeLabel = (n) => (SIZE_NAMES.find(([, v]) => v === Number(n)) || [`${n / 2}pt`])[0];
  const rulesText = [
    fileName && `检测文件：${fileName}`,
    school ? `识别学校：${school}` : "未识别到学校名称",
    `正文 ${style.bodyFont} ${sizeLabel(style.bodySize)}`,
    `一级标题 ${style.headingFont} ${sizeLabel(style.headingSize)}`,
    `行距 ${style.lineSpacing / 240} 倍`,
  ]
    .filter(Boolean)
    .join("；");

  return { school, style, rulesText };
}
