import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeText, extractStructure, toHtml, getCss } from "./utils/cleaner";
import { extractDocxText, extractPdfText } from "./utils/documentImport";
import {
  applyStructureOverrides,
  STRUCTURE_TYPE_OPTIONS,
} from "./utils/structureOverrides";
import { analyzeTemplateText } from "./utils/templateRules";
import { saveAs } from "file-saver";
import "./index.css";

const sample = `学校：浙江工商大学
论文题目：基于人工智能的论文自动排版系统研究
英文题目：Research on Automatic Paper Formatting System Based on Artificial Intelligence
专业：软件工程
班级：软工2201
学号：2022000001
姓名：张三
日期：二○二六年四月

摘要
随着生成式人工智能技术的快速发展，越来越多的学生开始借助人工智能工具完成论文写作。人工智能能够显著提升论文初稿生成效率，但在实际使用过程中，AI生成文本在复制到Word或WPS后经常出现标题层级混乱、段落缩进异常、项目符号残留、目录无法自动生成以及参考文献编号不统一等问题。本文设计并实现了一种基于规则识别与Word自动生成技术的论文自动排版系统。

关键词：人工智能；论文排版；格式清洗；Word自动生成；结构识别

Abstract
With the rapid development of generative artificial intelligence, more students begin to use AI tools to complete academic writing. This paper designs and implements an automatic paper formatting system based on rule recognition and Word document generation.

Keywords: Artificial Intelligence; Paper Formatting; Text Cleaning; Word Generation

一 引言
近年来，人工智能技术在文本生成、资料整理和学术写作等场景中得到了广泛应用。许多学生会使用AI工具生成论文初稿，再将文本复制到Word文档中进行修改。

二 文献综述
（一）AI写作工具研究
现有AI写作工具主要关注内容生成质量，例如文本流畅度、逻辑完整性和语言表达准确性。

（二）文档自动排版研究
文档自动排版通常依赖模板引擎或结构化文档转换技术。

三 系统设计
（一）文本清洗模块
文本清洗模块主要负责处理原始输入中的噪声内容，包括多余空行、全角空格、项目符号和不统一的编号格式。

（二）结构识别模块
系统通过规则识别论文题目、摘要、关键词、章节标题和参考文献。

表1 系统模块说明
| 模块 | 功能 |
| 文本清洗模块 | 清理多余空格和符号 |
| 结构识别模块 | 识别标题、摘要和参考文献 |
| Word生成模块 | 生成最终论文文档 |

四 系统实现
系统前端采用React实现，用户可以在左侧输入框中粘贴AI生成的论文文本，右侧实时预览清洗后的结果。

公式：y = ax + b

图1 系统整体流程示意图

五 结论
本文设计并实现了一种面向AI生成文本的论文自动排版系统。测试结果表明，该系统能够有效降低论文排版中的重复劳动。

参考文献
张三，2020，《人工智能导论》，北京：某出版社。
李四，2021，《自然语言处理技术研究》，上海：某大学出版社。
王五，2022，《文档自动排版方法研究》，《计算机应用研究》第5期，第66-72页。`;


const defaultCoverInfo = {
  school: "",
  title: "",
  englishTitle: "",
  major: "",
  className: "",
  studentId: "",
  name: "",
  date: "",
};

const defaultStyle = {
  bodyFont: "SimSun",
  headingFont: "SimHei",
  englishFont: "Times New Roman",
  bodySize: 24,
  headingSize: 28,
  smallHeadingSize: 24,
  tableSize: 21,
  lineSpacing: 360,
  paragraphAfter: 120,
  firstLineIndent: 420,
};

function loadSavedObject(key, defaults) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaults;
    return {
      ...defaults,
      ...JSON.parse(saved),
    };
  } catch {
    return defaults;
  }
}

function parseMeta(cleaned) {
  const meta = {
    school: "浙江工商大学",
    title: "未命名论文",
    englishTitle: "",
    major: "",
    className: "",
    studentId: "",
    name: "",
    date: "二○   年     月",
  };

  cleaned.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!/^\[META\] /.test(line)) return;

    const content = line.replace(/^\[META\] /, "");

    if (/^(学校|院校)[:：]/.test(content)) {
      meta.school = content.replace(/^(学校|院校)[:：]\s*/, "");
    } else if (/^(论文题目|题目)[:：]/.test(content)) {
      meta.title = content.replace(/^(论文题目|题目)[:：]\s*/, "");
    } else if (/^(英文题目|英文标题)[:：]/.test(content)) {
      meta.englishTitle = content.replace(/^(英文题目|英文标题)[:：]\s*/, "");
    } else if (/^专业[:：]/.test(content)) {
      meta.major = content.replace(/^专业[:：]\s*/, "");
    } else if (/^班级[:：]/.test(content)) {
      meta.className = content.replace(/^班级[:：]\s*/, "");
    } else if (/^学号[:：]/.test(content)) {
      meta.studentId = content.replace(/^学号[:：]\s*/, "");
    } else if (/^姓名[:：]/.test(content)) {
      meta.name = content.replace(/^姓名[:：]\s*/, "");
    } else if (/^日期[:：]/.test(content)) {
      meta.date = content.replace(/^日期[:：]\s*/, "");
    }
  });

  return meta;
}

function parseMarkdownTableRow(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function createWordTable(rows, style, wordApi) {
  if (!rows.length) return null;

  const { Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = wordApi;

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: rows.map(
      (cells) =>
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cell,
                        size: Number(style.tableSize),
                        font: style.bodyFont,
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
    ),
  });
}

function applyInputFallbacks(rawText) {
  let lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .filter((line) => line.toLowerCase() !== "documents:");

  const text = lines.join("\n");

  const hasPaperSignal =
    /摘要|关键词|Abstract|Keywords|参考文献|引言|文献综述|研究背景|系统设计|结论/.test(text) ||
    /^[一二三四五六七八九十][、.\s]/m.test(text);

  if (!hasPaperSignal) {
    return lines.join("\n");
  }

  const hasTitle = lines.some((line) => /^(论文题目|题目)[:：]/.test(line));
  const hasAbstract = lines.some((line) => /^摘\s*要\s*[:：]?$/.test(line));
  const hasKeywords = lines.some((line) => /^关\s*键\s*词/.test(line));

  if (!hasTitle && lines.length > 0) {
    const first = lines[0];
    if (first.length <= 80 && !/^摘要|关键词|Abstract|一\s|一、/.test(first)) {
      lines[0] = `论文题目：${first}`;
    }
  }

  if (!hasAbstract) {
    const firstLongIndex = lines.findIndex((line) => {
      return (
        line.length >= 40 &&
        !/^(论文题目|题目|英文题目|学校|专业|班级|学号|姓名|日期)[:：]/.test(line) &&
        !/^[一二三四五六七八九十][、.\s]/.test(line) &&
        !/^参考文献/.test(line)
      );
    });

    if (firstLongIndex !== -1) {
      lines.splice(firstLongIndex, 0, "摘要");
      if (!hasKeywords) {
        lines.splice(firstLongIndex + 2, 0, "关键词：");
      }
    } else {
      lines.splice(1, 0, "摘要", "请填写摘要内容。", "关键词：");
    }
  } else if (!hasKeywords) {
    const abstractIndex = lines.findIndex((line) => /^摘\s*要\s*[:：]?$/.test(line));
    lines.splice(abstractIndex + 2, 0, "关键词：");
  }

  return lines.join("\n");
}

function analyzeDocumentMode(text, cleaned) {
  const hasPaperStructure =
    cleaned.includes("[ABSTRACT]") ||
    cleaned.includes("[H1]") ||
    cleaned.includes("[REFERENCES]") ||
    cleaned.includes("[KEYWORDS]");

  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;

  if (hasPaperStructure) {
    return englishChars > chineseChars ? "英文论文模式" : "中文论文模式";
  }

  return "普通文档模式";
}

function buildPreviewInfo(cleaned, meta) {
  const lines = cleaned.split("\n").map((line) => line.trim());

  const chapters = lines
    .filter((line) => line.startsWith("[H1] "))
    .map((line) => line.replace("[H1] ", ""));

  const sections = lines
    .filter((line) => line.startsWith("[H2] "))
    .map((line) => line.replace("[H2] ", ""));

  return {
    title: meta.title || "未识别到标题",
    hasAbstract: lines.some((line) => line.includes("[ABSTRACT]")),
    hasKeywords: lines.some((line) => line.startsWith("[KEYWORDS]")),
    chapters,
    sections,
  };
}

function buildQualityChecks(cleaned, mode, previewInfo) {
  const lines = cleaned.split("\n").map((line) => line.trim());

  const hasReferences =
    lines.includes("[REFERENCES]") || lines.some((line) => line.startsWith("[REF] "));

  const checks = [];

  if (mode.includes("论文")) {
    checks.push({
      type: previewInfo.title && previewInfo.title !== "未命名论文" ? "ok" : "warn",
      text:
        previewInfo.title && previewInfo.title !== "未命名论文"
          ? "已识别论文题目"
          : "未识别到论文题目，将使用默认题目或封面输入框内容",
    });

    checks.push({
      type: previewInfo.hasAbstract ? "ok" : "warn",
      text: previewInfo.hasAbstract
        ? "已识别摘要"
        : "未识别到摘要，系统会自动补占位",
    });

    checks.push({
      type: previewInfo.hasKeywords ? "ok" : "warn",
      text: previewInfo.hasKeywords
        ? "已识别关键词"
        : "未识别到关键词，系统会自动留空",
    });

    checks.push({
      type: previewInfo.chapters.length > 0 ? "ok" : "warn",
      text:
        previewInfo.chapters.length > 0
          ? `已识别 ${previewInfo.chapters.length} 个一级标题`
          : "未识别到一级标题，可能会按普通正文导出",
    });

    checks.push({
      type: hasReferences ? "ok" : "warn",
      text: hasReferences
        ? "已识别参考文献"
        : "未识别到参考文献，可以继续导出",
    });
  } else {
    checks.push({
      type: "ok",
      text: "当前为普通文档模式，将按干净文档格式导出",
    });

    checks.push({
      type: lines.length > 3 ? "ok" : "warn",
      text: lines.length > 3 ? "已识别到正文内容" : "正文内容较少，请确认是否完整",
    });
  }

  return checks;
}

export default function App() {
  const wordApiRef = useRef(null);

  const [input, setInput] = useState(() => {
    return localStorage.getItem("paper_cleaner_input") || sample;
  });
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [structureOverrides, setStructureOverrides] = useState(() => {
    return loadSavedObject("paper_cleaner_structure_overrides", {});
  });

  const [templateInfo, setTemplateInfo] = useState({
    name: "",
    type: "",
    status: "未上传模板，将使用默认浙江工商大学模板",
    detectedSchool: "",
    detectedRules: "",
  });

  const [coverInfo, setCoverInfo] = useState(() => {
    return loadSavedObject("paper_cleaner_cover", defaultCoverInfo);
  });

  const [style, setStyle] = useState(() => {
    return loadSavedObject("paper_cleaner_style", defaultStyle);
  });

  const smartInput = useMemo(() => applyInputFallbacks(input), [input]);
  const autoCleaned = useMemo(() => normalizeText(smartInput), [smartInput]);
  const cleaned = useMemo(
    () => applyStructureOverrides(autoCleaned, structureOverrides),
    [autoCleaned, structureOverrides]
  );
  const autoStructure = useMemo(() => extractStructure(autoCleaned), [autoCleaned]);
  const structure = useMemo(() => extractStructure(cleaned), [cleaned]);
  const structureByIndex = useMemo(
    () => new Map(structure.map((item) => [item.index, item])),
    [structure]
  );
  const html = useMemo(() => toHtml(cleaned), [cleaned]);
  const autoMeta = useMemo(() => parseMeta(cleaned), [cleaned]);

  const detectedMode = useMemo(
    () => analyzeDocumentMode(smartInput, cleaned),
    [smartInput, cleaned]
  );

  const previewInfo = useMemo(
    () => buildPreviewInfo(cleaned, autoMeta),
    [cleaned, autoMeta]
  );

  const qualityChecks = useMemo(
    () => buildQualityChecks(cleaned, detectedMode, previewInfo),
    [cleaned, detectedMode, previewInfo]
  );

  useEffect(() => {
    localStorage.setItem("paper_cleaner_input", input);
  }, [input]);

  useEffect(() => {
    localStorage.setItem("paper_cleaner_cover", JSON.stringify(coverInfo));
  }, [coverInfo]);

  useEffect(() => {
    localStorage.setItem("paper_cleaner_style", JSON.stringify(style));
  }, [style]);

  useEffect(() => {
    localStorage.setItem(
      "paper_cleaner_structure_overrides",
      JSON.stringify(structureOverrides)
    );
  }, [structureOverrides]);

  function finalMeta() {
    return {
      school: coverInfo.school.trim() || autoMeta.school,
      title: coverInfo.title.trim() || autoMeta.title,
      englishTitle: coverInfo.englishTitle.trim() || autoMeta.englishTitle,
      major: coverInfo.major.trim() || autoMeta.major,
      className: coverInfo.className.trim() || autoMeta.className,
      studentId: coverInfo.studentId.trim() || autoMeta.studentId,
      name: coverInfo.name.trim() || autoMeta.name,
      date: coverInfo.date.trim() || autoMeta.date,
    };
  }

  function updateCover(key, value) {
    setCoverInfo((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateStyle(key, value) {
    setStyle((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function replaceInput(nextInput) {
    setInput(nextInput);
    setStructureOverrides({});
  }

  function updateStructureType(index, type) {
    setStructureOverrides((previous) => {
      const next = { ...previous };
      if (type === "auto") {
        delete next[index];
      } else {
        next[index] = type;
      }
      return next;
    });
  }

  async function handleTemplateUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const lowerName = fileName.toLowerCase();

    setTemplateInfo({
      name: fileName,
      type: "",
      status: "正在解析模板...",
      detectedSchool: "",
      detectedRules: "",
    });

    try {
      let text = "";

      if (lowerName.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        text = await extractDocxText(arrayBuffer);
      } else if (lowerName.endsWith(".pdf")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await extractPdfText(arrayBuffer, { maxPages: 5 });
        text = result.text;
      } else {
        setTemplateInfo({
          name: fileName,
          type: "",
          status: "目前只支持上传 .docx 或 .pdf 模板",
          detectedSchool: "",
          detectedRules: "",
        });
        return;
      }

      const detected = analyzeTemplateText(text, fileName);

      setTemplateInfo({
        name: fileName,
        type: lowerName.endsWith(".pdf") ? "PDF 格式说明" : "Word 格式说明",
        status:
          detected.appliedRuleCount > 0
            ? `已应用 ${detected.appliedRuleCount} 项明确写出的格式规则`
            : "已读取文件，但未发现可确认的文字格式规则，继续使用当前设置",
        detectedSchool: detected.school,
        detectedRules: detected.rulesText,
      });

      setStyle((prev) => ({
        ...prev,
        ...detected.styleUpdates,
      }));

      if (detected.school) {
        setCoverInfo((prev) => ({
          ...prev,
          school: prev.school || detected.school,
        }));
      }
    } catch (error) {
      console.error(error);
      setTemplateInfo({
        name: fileName,
        type: "",
        status: "模板解析失败，请换一个文件试试",
        detectedSchool: "",
        detectedRules: "",
      });
    }
  }

  async function handleContentUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    try {
      let text = "";

      if (fileName.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        text = await extractDocxText(arrayBuffer);
      } else if (fileName.endsWith(".pdf")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await extractPdfText(arrayBuffer, { maxPages: 100 });
        text = result.text;
        if (result.truncated) {
          alert(`PDF 共 ${result.totalPages} 页，为避免浏览器卡顿，本次只读取前 ${result.processedPages} 页。`);
        }
      } else if (fileName.endsWith(".txt")) {
        text = await file.text();
      } else {
        alert("内容文档目前支持 .docx、.pdf、.txt");
        return;
      }

      replaceInput(text);
      alert("文档内容已读取，可以在左侧继续修改。");
    } catch (error) {
      console.error(error);
      alert("读取文档失败，请换一个文件试试。");
    }
  }

  async function copyCleaned() {
    await navigator.clipboard.writeText(cleaned);
    alert("已复制清洗后的文本");
  }

  function downloadHtml() {
    const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>论文预览</title>
  <style>${getCss()}</style>
</head>
<body>
  <div class="preview">${html}</div>
</body>
</html>`;

    const blob = new Blob([fullHtml], {
      type: "text/html;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "paper-preview.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  function p(text, options = {}) {
    const { AlignmentType, Paragraph, TextRun } = wordApiRef.current;
    return new Paragraph({
      alignment: options.align || AlignmentType.LEFT,
      heading: options.heading,
      indent: options.indent,
      spacing:
        options.spacing || {
          line: Number(style.lineSpacing),
          after: Number(style.paragraphAfter),
        },
      tabStops: options.tabStops,
      children: [
        new TextRun({
          text: text || "",
          bold: options.bold || false,
          italics: options.italics || false,
          size: Number(options.size || style.bodySize),
          font: options.font || style.bodyFont,
        }),
      ],
    });
  }

  function mixedP(runs, options = {}) {
    const { AlignmentType, Paragraph, TextRun } = wordApiRef.current;
    return new Paragraph({
      alignment: options.align || AlignmentType.LEFT,
      indent: options.indent,
      spacing:
        options.spacing || {
          line: Number(style.lineSpacing),
          after: Number(style.paragraphAfter),
        },
      children: runs.map(
        (r) =>
          new TextRun({
            text: r.text || "",
            bold: r.bold || false,
            italics: r.italics || false,
            size: Number(r.size || options.size || style.bodySize),
            font: r.font || options.font || style.bodyFont,
          })
      ),
    });
  }

  function blankLine(after = 240) {
    const { Paragraph, TextRun } = wordApiRef.current;
    return new Paragraph({
      spacing: { after },
      children: [new TextRun({ text: "" })],
    });
  }

  function pageBreak() {
    const { PageBreak, Paragraph } = wordApiRef.current;
    return new Paragraph({
      children: [new PageBreak()],
    });
  }

  async function exportWord() {
    const wordApi = await import("docx");
    wordApiRef.current = wordApi;
    const {
      AlignmentType,
      Document,
      Footer,
      HeadingLevel,
      Packer,
      PageNumber,
      Paragraph,
      TableOfContents,
      TextRun,
    } = wordApi;
    const meta = finalMeta();
    const lines = cleaned.split("\n");

    const bodyItems = [];
    const abstractLines = [];
    const abstractEnLines = [];
    const refItems = [];

    let keywords = "";
    let keywordsEn = "";
    let zone = "preamble";

    let chapterIdx = 0;
    let sectionIdx = 0;
    let subsectionIdx = 0;

    const CN_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

    function addBodyItem(item) {
      bodyItems.push(item);
    }

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (/^\[META\] /.test(line)) continue;

      if (line === "[ABSTRACT]") {
        zone = "abstract";
        continue;
      }

      if (line === "[ABSTRACT_EN]") {
        zone = "abstractEn";
        continue;
      }

      if (line === "[REFERENCES]") {
        zone = "references";
        continue;
      }

      if (/^\[KEYWORDS\] /.test(line)) {
        keywords = line.replace(/^\[KEYWORDS\] /, "").trim();
        zone = "body";
        continue;
      }

      if (/^\[KEYWORDS_EN\] /.test(line)) {
        keywordsEn = line.replace(/^\[KEYWORDS_EN\] /, "").trim();
        zone = "body";
        continue;
      }

      if (/^\[ABSTRACT_BODY\] /.test(line)) {
        zone = "abstract";
        abstractLines.push(line.replace(/^\[ABSTRACT_BODY\] /, "").trim());
        continue;
      }

      if (/^\[ABSTRACT_EN_BODY\] /.test(line)) {
        zone = "abstractEn";
        abstractEnLines.push(line.replace(/^\[ABSTRACT_EN_BODY\] /, "").trim());
        continue;
      }

      if (/^\[BODY\] /.test(line)) {
        zone = "body";
        addBodyItem({
          type: "paragraph",
          text: line.replace(/^\[BODY\] /, "").trim(),
        });
        continue;
      }

      if (/^\[H1\] /.test(line)) {
        zone = "body";
        chapterIdx += 1;
        sectionIdx = 0;
        subsectionIdx = 0;

        const pureTitle = line.replace(/^\[H1\] /, "");
        const cn = CN_NUMS[chapterIdx - 1] || String(chapterIdx);

        addBodyItem({
          type: "chapter",
          title: pureTitle,
          tocLabel: `${cn}、 ${pureTitle}`,
          page: chapterIdx,
        });

        continue;
      }

      if (/^\[H2\] /.test(line)) {
        zone = "body";
        sectionIdx += 1;
        subsectionIdx = 0;

        const pureTitle = line.replace(/^\[H2\] /, "");
        const cn = CN_NUMS[sectionIdx - 1] || String(sectionIdx);

        addBodyItem({
          type: "section",
          title: pureTitle,
          tocLabel: `（${cn}） ${pureTitle}`,
          page: chapterIdx || 1,
        });

        continue;
      }

      if (/^\[H3\] /.test(line)) {
        zone = "body";
        subsectionIdx += 1;

        const pureTitle = line.replace(/^\[H3\] /, "");

        addBodyItem({
          type: "subsection",
          title: pureTitle,
          tocLabel: `${chapterIdx}.${sectionIdx}.${subsectionIdx} ${pureTitle}`,
          page: chapterIdx || 1,
        });

        continue;
      }

      if (/^\[REF\] /.test(line)) {
        refItems.push(line.replace(/^\[REF\] /, "").trim());
        continue;
      }

      if (/^\[TABLE_CAPTION\] /.test(line)) {
        addBodyItem({
          type: "tableCaption",
          text: line.replace(/^\[TABLE_CAPTION\] /, ""),
        });
        zone = "body";
        continue;
      }

      if (/^\[FIGURE_CAPTION\] /.test(line)) {
        addBodyItem({
          type: "figureCaption",
          text: line.replace(/^\[FIGURE_CAPTION\] /, ""),
        });
        zone = "body";
        continue;
      }

      if (/^\[FORMULA\] /.test(line)) {
        addBodyItem({
          type: "formula",
          text: line.replace(/^\[FORMULA\] /, ""),
        });
        zone = "body";
        continue;
      }

      if (/^\[TABLE\] /.test(line)) {
        const rowText = line.replace(/^\[TABLE\] /, "");
        const row = parseMarkdownTableRow(rowText);
        const last = bodyItems[bodyItems.length - 1];

        if (last && last.type === "table") {
          last.rows.push(row);
        } else {
          addBodyItem({
            type: "table",
            rows: [row],
          });
        }

        zone = "body";
        continue;
      }

      if (zone === "abstract") {
        abstractLines.push(line);
        continue;
      }

      if (zone === "abstractEn") {
        abstractEnLines.push(line);
        continue;
      }

      if (zone === "references") {
        refItems.push(line.trim());
        continue;
      }

      if (zone === "body") {
        const text = line
          .replace(/^[-•·]\s*/, "")
          .replace(/^\d+[、.)．]\s*/, "")
          .trim();

        if (text) {
          addBodyItem({
            type: "paragraph",
            text,
          });
        }
      }
    }

    // ===== 普通文档模式 =====
    // 如果没有识别到论文结构，就不要生成论文模板，
    // 直接把用户粘贴的普通材料导出为干净 Word。
    const hasPaperStructure =
      bodyItems.length > 0 ||
      abstractLines.length > 0 ||
      abstractEnLines.length > 0 ||
      keywords ||
      keywordsEn ||
      refItems.length > 0;

    if (!hasPaperStructure) {
      let rawLines = input
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .filter((line) => line.toLowerCase() !== "documents:");

      // 去掉可能误复制进来的文件名行
      if (
        rawLines.length > 1 &&
        /^[\w\s-]+$/.test(rawLines[0]) &&
        !rawLines[0].includes(":") &&
        rawLines[1].toLowerCase().includes("cover letter")
      ) {
        rawLines = rawLines.slice(1);
      }

      let genericTitle = finalMeta().title;

      if (!genericTitle || genericTitle === "未命名论文") {
        genericTitle =
          rawLines[0] && rawLines[0].length <= 120
            ? rawLines[0]
            : "清洗后的文档";
      }

      const contentLines =
        rawLines[0] === genericTitle ? rawLines.slice(1) : rawLines;

      const genericChildren = [];

      genericChildren.push(
        p(genericTitle, {
          align: AlignmentType.CENTER,
          bold: true,
          size: Number(style.headingSize),
          font: style.englishFont,
          spacing: { after: 420 },
        })
      );

      contentLines.forEach((line) => {
        // 英文罗马数字标题：I. II. III. IV.
        if (/^[IVX]+\.\s+/.test(line)) {
          genericChildren.push(
            p(line, {
              bold: true,
              size: Number(style.smallHeadingSize),
              font: style.headingFont,
              spacing: { before: 260, after: 160 },
            })
          );
          return;
        }

        // Dear / Sincerely 这类信件固定格式
        if (
          /^Dear\b/i.test(line) ||
          /^Sincerely/i.test(line) ||
          /^To:/i.test(line) ||
          /^Subject:/i.test(line) ||
          /^Applicant:/i.test(line) ||
          /^Group Leader:/i.test(line) ||
          /^Travel Dates:/i.test(line)
        ) {
          genericChildren.push(
            p(line, {
              size: Number(style.bodySize),
              font: style.englishFont,
              spacing: { after: 140 },
            })
          );
          return;
        }

        // 短标题或说明性标题
        if (line.endsWith(":") && line.length <= 100) {
          genericChildren.push(
            p(line, {
              bold: true,
              size: Number(style.bodySize),
              font: style.englishFont,
              spacing: { before: 180, after: 100 },
            })
          );
          return;
        }

        // 普通段落
        genericChildren.push(
          p(line, {
            indent: { firstLine: Number(style.firstLineIndent) },
            size: Number(style.bodySize),
            font: style.englishFont,
            spacing: {
              line: Number(style.lineSpacing),
              after: Number(style.paragraphAfter),
            },
          })
        );
      });

      const pageMargin = {
        top: 1440,
        right: 1260,
        bottom: 1440,
        left: 1260,
      };

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: pageMargin,
              },
            },
            children: genericChildren,
          },
        ],
      });

      const defaultFileName = genericTitle || "文档";
      const fileName = window.prompt("请输入文件名 (不需要输入 .docx 后缀):", defaultFileName);
      if (fileName !== null && fileName.trim() !== "") {
        Packer.toBlob(doc).then((blob) => {
          saveAs(blob, `${fileName.trim()}.docx`);
        });
      }

      return;
    }

    const coverChildren = [
      blankLine(520),

      p(meta.school, {
        align: AlignmentType.CENTER,
        bold: true,
        size: 38,
        font: style.headingFont,
        spacing: { after: 520 },
      }),

      p("毕业论文（设计）：正文", {
        align: AlignmentType.CENTER,
        size: 24,
        font: style.bodyFont,
        spacing: { after: 160 },
      }),

      p("毕业论文（设计）题目：　　　　　　　　　　　　　　　　　　　　　　　　　　　", {
        align: AlignmentType.CENTER,
        size: 22,
        font: style.bodyFont,
        spacing: { after: 1080 },
      }),

      p("本科毕业论文（设计）正文", {
        align: AlignmentType.CENTER,
        bold: true,
        size: 34,
        font: style.headingFont,
        spacing: { after: 760 },
      }),

      p(`题目：${meta.title}`, {
        align: AlignmentType.CENTER,
        bold: true,
        size: 28,
        font: style.bodyFont,
        spacing: { after: 180 },
      }),

      p(meta.englishTitle || "English Title", {
        align: AlignmentType.CENTER,
        size: 24,
        font: style.englishFont,
        spacing: { after: 820 },
      }),

      p(`专    业：${meta.major}`, {
        size: 24,
        font: style.bodyFont,
        spacing: { after: 260 },
      }),

      p(`班    级：${meta.className}`, {
        size: 24,
        font: style.bodyFont,
        spacing: { after: 260 },
      }),

      p(`学    号：${meta.studentId}`, {
        size: 24,
        font: style.bodyFont,
        spacing: { after: 260 },
      }),

      p(`姓    名：${meta.name}`, {
        size: 24,
        font: style.bodyFont,
        spacing: { after: 760 },
      }),

      p(meta.date || "二○   年     月", {
        align: AlignmentType.CENTER,
        size: 24,
        font: style.bodyFont,
        spacing: { after: 200 },
      }),
    ];

    const frontChildren = [];

    frontChildren.push(
      p(meta.title, {
        align: AlignmentType.CENTER,
        bold: true,
        size: Number(style.headingSize),
        font: style.headingFont,
        spacing: { after: 300 },
      })
    );

    frontChildren.push(
      mixedP(
        [
          { text: "摘  要：", bold: true, font: style.headingFont },
          { text: abstractLines.join("") || "请填写摘要内容。" },
        ],
        {
          spacing: { line: Number(style.lineSpacing), after: 160 },
        }
      )
    );

    frontChildren.push(
      mixedP(
        [
          { text: "关键词：", bold: true, font: style.headingFont },
          { text: keywords || "请填写关键词" },
        ],
        {
          spacing: { line: Number(style.lineSpacing), after: 420 },
        }
      )
    );

    frontChildren.push(
      p(meta.englishTitle || "English Title", {
        align: AlignmentType.CENTER,
        bold: true,
        size: 26,
        font: style.englishFont,
        spacing: { after: 260 },
      })
    );

    frontChildren.push(
      mixedP(
        [
          { text: "Abstract: ", bold: true, font: style.englishFont },
          {
            text:
              abstractEnLines.join(" ") ||
              "Please fill in the English abstract.",
            font: style.englishFont,
          },
        ],
        {
          spacing: { line: Number(style.lineSpacing), after: 160 },
          font: style.englishFont,
        }
      )
    );

    frontChildren.push(
      mixedP(
        [
          { text: "Keywords: ", bold: true, font: style.englishFont },
          { text: keywordsEn || "Keywords", font: style.englishFont },
        ],
        {
          spacing: { line: Number(style.lineSpacing), after: 500 },
          font: style.englishFont,
        }
      )
    );

    frontChildren.push(pageBreak());

    frontChildren.push(
      p("正文目录", {
        align: AlignmentType.CENTER,
        bold: true,
        size: Number(style.headingSize),
        font: style.headingFont,
        spacing: { after: 360 },
      })
    );

    frontChildren.push(
      new TableOfContents("正文目录", {
        hyperlink: true,
        headingStyleRange: "1-3",
        beginDirty: true,
      })
    );

    const bodyChildren = [];

    bodyChildren.push(
      p("毕业论文（设计）：正文", {
        size: 20,
        font: style.bodyFont,
        spacing: { after: 40 },
      }),

      p("毕业论文（设计）题目：　　　　　　　　　　　　　　　　　　　　　　　　　　　", {
        size: 20,
        font: style.bodyFont,
        spacing: { after: 140 },
      }),

      blankLine(280)
    );

    bodyItems.forEach((item) => {
      if (item.type === "chapter") {
        bodyChildren.push(
          p(item.tocLabel, {
            align: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            bold: true,
            size: Number(style.headingSize),
            font: style.headingFont,
            spacing: { before: 360, after: 260 },
          })
        );
        return;
      }

      if (item.type === "section") {
        bodyChildren.push(
          p(item.tocLabel, {
            heading: HeadingLevel.HEADING_2,
            bold: true,
            size: Number(style.smallHeadingSize),
            font: style.headingFont,
            spacing: { before: 240, after: 140 },
          })
        );
        return;
      }

      if (item.type === "subsection") {
        bodyChildren.push(
          p(item.tocLabel, {
            heading: HeadingLevel.HEADING_3,
            bold: true,
            size: Number(style.smallHeadingSize),
            font: style.headingFont,
            indent: { left: 420 },
            spacing: { before: 180, after: 100 },
          })
        );
        return;
      }

      if (item.type === "tableCaption") {
        bodyChildren.push(
          p(item.text, {
            align: AlignmentType.CENTER,
            size: Number(style.tableSize),
            font: style.bodyFont,
            spacing: { before: 160, after: 100 },
          })
        );
        return;
      }

      if (item.type === "figureCaption") {
        bodyChildren.push(
          p("【图片占位】", {
            align: AlignmentType.CENTER,
            size: 22,
            font: style.bodyFont,
            spacing: { before: 240, after: 120 },
          })
        );

        bodyChildren.push(
          p(item.text, {
            align: AlignmentType.CENTER,
            size: Number(style.tableSize),
            font: style.bodyFont,
            spacing: { after: 160 },
          })
        );
        return;
      }

      if (item.type === "formula") {
        bodyChildren.push(
          p(item.text, {
            align: AlignmentType.CENTER,
            size: Number(style.bodySize),
            font: style.englishFont,
            spacing: { before: 160, after: 160 },
          })
        );
        return;
      }

      if (item.type === "table") {
        const table = createWordTable(item.rows, style, wordApi);
        if (table) {
          bodyChildren.push(table);
          bodyChildren.push(blankLine(160));
        }
        return;
      }

      bodyChildren.push(
        p(item.text, {
          indent: { firstLine: Number(style.firstLineIndent) },
          size: Number(style.bodySize),
          font: style.bodyFont,
          spacing: {
            line: Number(style.lineSpacing),
            after: Number(style.paragraphAfter),
          },
        })
      );
    });

    if (refItems.length) {
      bodyChildren.push(pageBreak());

      bodyChildren.push(
        p("参考文献", {
          align: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
          bold: true,
          size: Number(style.headingSize),
          font: style.headingFont,
          spacing: { after: 300 },
        })
      );

      refItems.forEach((ref, i) => {
        bodyChildren.push(
          p(`[${i + 1}] ${ref}`, {
            indent: { left: 420, hanging: 420 },
            size: Number(style.bodySize),
            font: style.bodyFont,
            spacing: {
              line: Number(style.lineSpacing),
              after: Number(style.paragraphAfter),
            },
          })
        );
      });
    }

    const pageMargin = {
      top: 1440,
      right: 1260,
      bottom: 1440,
      left: 1260,
    };

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: pageMargin,
            },
          },
          children: coverChildren,
        },
        {
          properties: {
            page: {
              margin: pageMargin,
            },
          },
          children: frontChildren,
        },
        {
          properties: {
            page: {
              margin: pageMargin,
              pageNumbers: { start: 1 },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ children: [PageNumber.CURRENT] })],
                }),
              ],
            }),
          },
          children: bodyChildren,
        },
      ],
    });

    const defaultFileName = meta.title || "论文";
    const fileName = window.prompt("请输入文件名 (不需要输入 .docx 后缀):", defaultFileName);
    if (fileName !== null && fileName.trim() !== "") {
      Packer.toBlob(doc).then((blob) => {
        saveAs(blob, `${fileName.trim()}.docx`);
      });
    }
  }

  const fieldStyle = {
    padding: "8px 10px",
    border: "1px solid #ddd",
    borderRadius: 10,
    fontSize: 14,
    width: "100%",
  };

  const labelStyle = {
    fontSize: 13,
    color: "#555",
    marginBottom: 4,
  };

  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="badge">AI 论文格式清洗器 MVP</p>
          <h1>把 AI 文本变成干净论文格式</h1>
          <p className="desc">
            上传或粘贴内容，自动识别文档类型，清洗排版并导出 Word。
          </p>
        </div>

        <div className="actions">
          <button onClick={copyCleaned}>复制清洗文本</button>
          <button onClick={downloadHtml}>导出 HTML</button>
          <button onClick={exportWord}>导出 Word</button>
        </div>
      </header>

      {/* 顶部：模板 + 识别状态 */}
      <section
        className="top-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div className="card">
          <h2>上传格式说明（可选）</h2>
          <p className="desc">
            当前使用预设的浙江工商大学模板。上传 Word 或 PDF 后，只会读取其中明确写出的学校、字体、字号和行距说明，不会假装识别文档内部样式。
          </p>

          <input
            type="file"
            accept=".docx,.pdf"
            onChange={handleTemplateUpload}
            style={{
              padding: "10px",
              border: "1px solid #ddd",
              borderRadius: 10,
              width: "100%",
              marginTop: 8,
            }}
          />

          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              background: "#f7f7f7",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <div>
              <strong>状态：</strong>
              {templateInfo.status}
            </div>

            {templateInfo.name && (
              <div>
                <strong>文件：</strong>
                {templateInfo.name}
              </div>
            )}

            {templateInfo.type && (
              <div>
                <strong>类型：</strong>
                {templateInfo.type}
              </div>
            )}

            {templateInfo.detectedSchool && (
              <div>
                <strong>识别学校：</strong>
                {templateInfo.detectedSchool}
              </div>
            )}

            {templateInfo.detectedRules && (
              <div>
                <strong>检测说明：</strong>
                {templateInfo.detectedRules}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>识别状态</h2>

          <p
            style={{
              marginTop: 8,
              fontSize: 16,
            }}
          >
            已识别：
            <strong style={{ marginLeft: 6 }}>{detectedMode}</strong>
          </p>

          <button
            onClick={() => setShowExportPreview(!showExportPreview)}
            style={{
              marginTop: 10,
            }}
          >
            {showExportPreview ? "收起导出预览" : "导出前预览确认"}
          </button>

          {showExportPreview && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "#f7f7f7",
                fontSize: 14,
                lineHeight: 1.7,
                maxHeight: 260,
                overflow: "auto",
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <strong>导出质量检查：</strong>

                <ul style={{ marginTop: 6, paddingLeft: 20 }}>
                  {qualityChecks.map((item, index) => (
                    <li key={index}>
                      {item.type === "ok" ? "✅ " : "⚠️ "}
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <strong>标题：</strong>
                {previewInfo.title}
              </div>

              <div>
                <strong>摘要：</strong>
                {previewInfo.hasAbstract ? "已识别" : "未识别，已自动补占位"}
              </div>

              <div>
                <strong>关键词：</strong>
                {previewInfo.hasKeywords ? "已识别" : "未识别，已自动补占位"}
              </div>

              <div style={{ marginTop: 8 }}>
                <strong>一级标题：</strong>
                {previewInfo.chapters.length > 0 ? (
                  <ul style={{ marginTop: 4 }}>
                    {previewInfo.chapters.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <span> 未识别</span>
                )}
              </div>

              <div>
                <strong>二级标题：</strong>
                {previewInfo.sections.length > 0 ? (
                  <ul style={{ marginTop: 4 }}>
                    {previewInfo.sections.slice(0, 10).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <span> 未识别</span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 主工作区：上传内容 + 输入 + 预览 */}
      <section className="grid">
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <h2 style={{ marginBottom: 4 }}>原始 AI 文本</h2>
              <p className="desc" style={{ marginBottom: 0 }}>
                可以直接粘贴，也可以上传 Word / PDF / TXT 后继续编辑。
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 10,
                }}
              >
                <button onClick={() => replaceInput("")}>清空文本</button>

                <button
                  onClick={() => {
                    replaceInput(sample);
                    setCoverInfo(defaultCoverInfo);
                    setStyle(defaultStyle);
                  }}
                >
                  重置全部
                </button>
              </div>
            </div>

            <input
              type="file"
              accept=".docx,.pdf,.txt"
              onChange={handleContentUpload}
              style={{
                maxWidth: 230,
                fontSize: 13,
              }}
            />
          </div>

          <textarea
            value={input}
            onChange={(e) => replaceInput(e.target.value)}
            style={{
              minHeight: 520,
            }}
          />
        </div>

        <div className="card">
          <h2>清洗后预览</h2>
          <p className="desc">这里展示系统识别和清洗后的结果。</p>

          <style>{getCss()}</style>

          <div
            className="preview"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              minHeight: 520,
            }}
          />
        </div>
      </section>

      {/* 底部：高级设置，默认折叠 */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 16,
          marginTop: 20,
        }}
      >
        <details className="card">
          <summary
            style={{
              cursor: "pointer",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            封面信息
          </summary>

          <p className="desc" style={{ marginTop: 12 }}>
            可以手动填写；不填则自动从左侧文本中识别。
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div>
              <div style={labelStyle}>学校</div>
              <input
                style={fieldStyle}
                value={coverInfo.school}
                placeholder={autoMeta.school}
                onChange={(e) => updateCover("school", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>论文题目</div>
              <input
                style={fieldStyle}
                value={coverInfo.title}
                placeholder={autoMeta.title}
                onChange={(e) => updateCover("title", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>英文题目</div>
              <input
                style={fieldStyle}
                value={coverInfo.englishTitle}
                placeholder={autoMeta.englishTitle || "English Title"}
                onChange={(e) => updateCover("englishTitle", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>专业</div>
              <input
                style={fieldStyle}
                value={coverInfo.major}
                placeholder={autoMeta.major || "软件工程"}
                onChange={(e) => updateCover("major", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>班级</div>
              <input
                style={fieldStyle}
                value={coverInfo.className}
                placeholder={autoMeta.className || "软工2201"}
                onChange={(e) => updateCover("className", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>学号</div>
              <input
                style={fieldStyle}
                value={coverInfo.studentId}
                placeholder={autoMeta.studentId || "2022000001"}
                onChange={(e) => updateCover("studentId", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>姓名</div>
              <input
                style={fieldStyle}
                value={coverInfo.name}
                placeholder={autoMeta.name || "张三"}
                onChange={(e) => updateCover("name", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>日期</div>
              <input
                style={fieldStyle}
                value={coverInfo.date}
                placeholder={autoMeta.date || "二○二六年四月"}
                onChange={(e) => updateCover("date", e.target.value)}
              />
            </div>
          </div>
        </details>

        <details className="card">
          <summary
            style={{
              cursor: "pointer",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            格式设置
          </summary>

          <p className="desc" style={{ marginTop: 12 }}>
            一般不用改。上传模板后，这里会自动更新部分参数。
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div>
              <div style={labelStyle}>正文字体</div>
              <input
                style={fieldStyle}
                value={style.bodyFont}
                onChange={(e) => updateStyle("bodyFont", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>标题字体</div>
              <input
                style={fieldStyle}
                value={style.headingFont}
                onChange={(e) => updateStyle("headingFont", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>英文字体</div>
              <input
                style={fieldStyle}
                value={style.englishFont}
                onChange={(e) => updateStyle("englishFont", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>正文字号</div>
              <input
                style={fieldStyle}
                type="number"
                value={style.bodySize}
                onChange={(e) => updateStyle("bodySize", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>一级标题字号</div>
              <input
                style={fieldStyle}
                type="number"
                value={style.headingSize}
                onChange={(e) => updateStyle("headingSize", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>二级标题字号</div>
              <input
                style={fieldStyle}
                type="number"
                value={style.smallHeadingSize}
                onChange={(e) => updateStyle("smallHeadingSize", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>行距</div>
              <input
                style={fieldStyle}
                type="number"
                value={style.lineSpacing}
                onChange={(e) => updateStyle("lineSpacing", e.target.value)}
              />
            </div>

            <div>
              <div style={labelStyle}>首行缩进</div>
              <input
                style={fieldStyle}
                type="number"
                value={style.firstLineIndent}
                onChange={(e) => updateStyle("firstLineIndent", e.target.value)}
              />
            </div>
          </div>
        </details>

        <details className="card">
          <summary
            style={{
              cursor: "pointer",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            结构识别与人工修正
          </summary>

          <div className="structureEditorToolbar">
            <p className="desc">
              修改后会立即影响右侧预览和 Word 导出；替换原始内容时会自动清空这些修正。
            </p>
            <button
              type="button"
              onClick={() => setStructureOverrides({})}
              disabled={Object.keys(structureOverrides).length === 0}
            >
              重置人工修正（{Object.keys(structureOverrides).length}）
            </button>
          </div>

          <div className="structureEditor">
            {autoStructure
              .filter((item) => item.type !== "空行")
              .map((autoItem) => {
                const override = structureOverrides[autoItem.index] || "auto";
                const finalItem = structureByIndex.get(autoItem.index);
                const finalType =
                  override === "ignore" ? "已忽略" : finalItem?.type || autoItem.type;

                return (
                  <div
                    className={`structureEditorRow ${override !== "auto" ? "isOverridden" : ""}`}
                    key={autoItem.index}
                  >
                    <span className="structureLineNumber">{autoItem.index + 1}</span>
                    <div>
                      <select
                        className="structureTypeSelect"
                        aria-label={`第 ${autoItem.index + 1} 行的结构类型`}
                        value={override}
                        onChange={(event) =>
                          updateStructureType(autoItem.index, event.target.value)
                        }
                      >
                        <option value="auto">自动：{autoItem.type}</option>
                        {STRUCTURE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="structureFinalType">结果：{finalType}</span>
                    </div>
                    <p>{autoItem.text || "（空内容）"}</p>
                  </div>
                );
              })}
          </div>

        </details>
      </section>
    </main>
  );
}
