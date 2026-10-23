import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeText, extractStructure, toHtml, getCss } from "./utils/cleaner";
import {
  analyzeDocumentMode,
  applyInputFallbacks,
  buildPreviewInfo,
  buildQualityChecks,
  hasPaperStructure,
  mergeMeta,
  parseMeta,
  safeFileName,
} from "./utils/paper";
import { analyzeTemplateText, DEFAULT_STYLE } from "./utils/templateRules";
import { SAMPLE_TEXT } from "./sample";

const DEFAULT_COVER = {
  school: "",
  title: "",
  englishTitle: "",
  major: "",
  className: "",
  studentId: "",
  name: "",
  date: "",
};

const COVER_FIELDS = [
  ["school", "学校"],
  ["title", "论文题目"],
  ["englishTitle", "英文题目"],
  ["major", "专业"],
  ["className", "班级"],
  ["studentId", "学号"],
  ["name", "姓名"],
  ["date", "日期"],
];

const SIZE_OPTIONS = [
  ["三号", 32],
  ["小三", 30],
  ["四号", 28],
  ["小四", 24],
  ["五号", 21],
];

const LINE_OPTIONS = [
  ["单倍行距", 240],
  ["1.25 倍", 300],
  ["1.5 倍", 360],
  ["2 倍", 480],
];

const FONT_OPTIONS = [
  ["宋体", "SimSun"],
  ["黑体", "SimHei"],
  ["楷体", "KaiTi"],
  ["仿宋", "FangSong"],
];

const NUMBERING_OPTIONS = [
  ["cn", "一、（一）1.（文科常用）"],
  ["arabic", "1 / 1.1 / 1.1.1（理工科常用）"],
];

function loadSaved(key, defaults) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaults;
    if (typeof defaults === "string") return saved;
    return { ...defaults, ...JSON.parse(saved) };
  } catch {
    return defaults;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // 隐私模式或存储已满时忽略，不影响使用
  }
}

async function readFileAsText(file, { maxPdfPages } = {}) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return file.text();

  if (name.endsWith(".docx")) {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value || "";
  }

  if (name.endsWith(".pdf")) {
    // 用 legacy 版本：标准版依赖很新的浏览器特性，国内不少基于旧内核的浏览器会卡住
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
    const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    const last = Math.min(pdf.numPages, maxPdfPages || pdf.numPages);
    for (let i = 1; i <= last; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join("\n\n");
  }

  throw new Error("只支持 .docx、.pdf、.txt 文件");
}

function Select({ id, label, value, options, onChange }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([text, v]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function App() {
  const [input, setInput] = useState(() => loadSaved("paper_cleaner_input", SAMPLE_TEXT));
  const [cover, setCover] = useState(() => loadSaved("paper_cleaner_cover", DEFAULT_COVER));
  const [style, setStyle] = useState(() => loadSaved("paper_cleaner_style", DEFAULT_STYLE));
  const [numbering, setNumbering] = useState(() => loadSaved("paper_cleaner_numbering", "cn"));
  const [template, setTemplate] = useState({ status: "未上传模板，使用默认的浙江工商大学格式", rules: "" });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const noticeTimer = useRef(0);

  const smartInput = useMemo(() => applyInputFallbacks(input), [input]);
  const cleaned = useMemo(() => normalizeText(smartInput), [smartInput]);
  const structure = useMemo(() => extractStructure(cleaned), [cleaned]);
  const html = useMemo(() => toHtml(cleaned), [cleaned]);
  const autoMeta = useMemo(() => parseMeta(cleaned), [cleaned]);
  const mode = useMemo(() => analyzeDocumentMode(smartInput, cleaned), [smartInput, cleaned]);
  const info = useMemo(() => buildPreviewInfo(cleaned, mergeMeta(cover, autoMeta)), [cleaned, cover, autoMeta]);
  const checks = useMemo(() => buildQualityChecks(cleaned, mode, info), [cleaned, mode, info]);
  const warnings = checks.filter((c) => c.type === "warn").length;

  useEffect(() => save("paper_cleaner_input", input), [input]);
  useEffect(() => save("paper_cleaner_cover", cover), [cover]);
  useEffect(() => save("paper_cleaner_style", style), [style]);
  useEffect(() => save("paper_cleaner_numbering", numbering), [numbering]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  function show(text, tone = "ok") {
    clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }

  function updateStyle(key, value) {
    const numeric = ["bodySize", "headingSize", "smallHeadingSize", "tableSize", "lineSpacing"].includes(key);
    setStyle((prev) => {
      const next = { ...prev, [key]: numeric ? Number(value) : value };
      // 首行缩进固定为 2 个字符，跟着正文字号变
      if (key === "bodySize") next.firstLineIndent = 2 * Number(value) * 10;
      return next;
    });
  }

  async function handleContentUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await readFileAsText(file);
      if (!text.trim()) throw new Error("没有读到文字，扫描版 PDF 需要先做文字识别");
      setInput(text);
      show(`已读取「${file.name}」，可以在左侧继续修改`);
    } catch (error) {
      console.error(error);
      show(`读取失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleTemplateUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setTemplate({ status: `正在解析「${file.name}」…`, rules: "" });
    try {
      const text = await readFileAsText(file, { maxPdfPages: 8 });
      const detected = analyzeTemplateText(text, file.name);
      setStyle(detected.style);
      if (detected.school) setCover((prev) => ({ ...prev, school: prev.school || detected.school }));
      setTemplate({ status: "模板已解析，格式参数已更新，可在下方「格式设置」里核对", rules: detected.rulesText });
    } catch (error) {
      console.error(error);
      setTemplate({ status: `模板解析失败：${error.message}`, rules: "" });
    }
  }

  async function copyCleaned() {
    try {
      await navigator.clipboard.writeText(cleaned);
      show("已复制清洗后的文本");
    } catch {
      show("浏览器不允许自动复制，请在「结构识别结果」里手动选择", "error");
    }
  }

  async function downloadHtml() {
    const { saveAs } = await import("file-saver");
    const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${info.title}</title><style>${getCss()}</style></head><body><div class="preview">${html}</div></body></html>`;
    saveAs(new Blob([page], { type: "text/html;charset=utf-8" }), `${safeFileName(info.title)}.html`);
  }

  async function exportWord() {
    setBusy(true);
    try {
      const [{ buildPaperDocument, buildGenericDocument }, { Packer }, { saveAs }] = await Promise.all([
        import("./utils/wordExport.js"),
        import("docx"),
        import("file-saver"),
      ]);
      let doc;
      let name;
      if (hasPaperStructure(cleaned)) {
        const meta = mergeMeta(cover, autoMeta);
        ({ doc } = buildPaperDocument(cleaned, meta, style, { numbering }));
        name = meta.title;
      } else {
        const result = buildGenericDocument(input, cover.title.trim(), style);
        doc = result.doc;
        name = result.title;
      }
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${safeFileName(name)}.docx`);
      show("已导出 Word。打开时如果提示“更新域”，选“是”，目录页码就会自动生成");
    } catch (error) {
      console.error(error);
      show(`导出失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setInput(SAMPLE_TEXT);
    setCover(DEFAULT_COVER);
    setStyle(DEFAULT_STYLE);
    setNumbering("cn");
    setTemplate({ status: "未上传模板，使用默认的浙江工商大学格式", rules: "" });
    show("已恢复示例文本和默认格式");
  }

  return (
    <main className="page">
      <header className="header">
        <div className="header-text">
          <p className="badge">AI 论文格式清洗器</p>
          <h1>把 AI 写的论文，变成能直接交的 Word</h1>
          <p className="desc">
            粘贴或上传文本，自动识别题目、摘要、各级标题、表格和参考文献，按学校格式导出带目录和页码的 Word。所有处理都在你的浏览器里完成，文本不会上传。
          </p>
          <ol className="steps">
            <li>粘贴或上传论文文本</li>
            <li>核对右侧预览和识别结果</li>
            <li>导出 Word</li>
          </ol>
        </div>
        <div className="actions">
          <button className="primary" onClick={exportWord} disabled={busy}>
            {busy ? "处理中…" : "导出 Word"}
          </button>
          <button className="secondary" onClick={downloadHtml}>导出 HTML</button>
          <button className="secondary" onClick={copyCleaned}>复制清洗文本</button>
        </div>
      </header>

      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <section className="top-row">
        <div className="card">
          <h2>学校格式模板（可选）</h2>
          <p className="desc">
            不上传就用默认的浙江工商大学格式。上传学校发的格式要求（Word 或 PDF），会尝试识别学校、字体、字号和行距。
          </p>
          <label className="file-button" htmlFor="templateFile">
            选择模板文件
            <input id="templateFile" type="file" accept=".docx,.pdf" onChange={handleTemplateUpload} />
          </label>
          <div className="status-box">
            <div>{template.status}</div>
            {template.rules && <div className="muted">{template.rules}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>导出前检查</h2>
            <span className={`pill ${warnings ? "warn" : "ok"}`}>{mode}</span>
          </div>
          <ul className="checks">
            {checks.map((item) => (
              <li key={item.text} className={item.type}>
                <span className="dot" aria-hidden="true" />
                {item.text}
              </li>
            ))}
          </ul>
          {info.chapters.length > 0 && (
            <p className="muted outline">
              <strong>章节：</strong>
              {info.chapters.join(" · ")}
            </p>
          )}
        </div>
      </section>

      <section className="work">
        <div className="card">
          <div className="card-head wrap">
            <div>
              <h2>原始文本</h2>
              <p className="desc">直接粘贴 AI 生成的内容，或上传 Word / PDF / TXT。</p>
            </div>
            <div className="tool-row">
              <label className="file-button small" htmlFor="contentFile">
                上传文件
                <input id="contentFile" type="file" accept=".docx,.pdf,.txt,.md" onChange={handleContentUpload} />
              </label>
              <button className="ghost" onClick={() => setInput("")}>清空</button>
              <button className="ghost" onClick={resetAll}>恢复示例</button>
            </div>
          </div>
          <textarea
            id="paperInput"
            aria-label="原始论文文本"
            value={input}
            placeholder="在这里粘贴论文文本，例如从 ChatGPT、Claude、Kimi 复制的内容"
            onChange={(e) => setInput(e.target.value)}
          />
        </div>

        <div className="card">
          <h2>清洗后预览</h2>
          <p className="desc">按识别结果排版，导出的 Word 会自动加上标题编号、目录和页码。</p>
          <style>{getCss()}</style>
          <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </section>

      <section className="settings">
        <details className="card">
          <summary>封面信息</summary>
          <p className="desc">不填就从文本里自动识别（灰色提示就是识别到的内容）。</p>
          <div className="form-grid">
            {COVER_FIELDS.map(([key, label]) => (
              <label className="field" key={key} htmlFor={`cover-${key}`}>
                <span>{label}</span>
                <input
                  id={`cover-${key}`}
                  value={cover[key]}
                  placeholder={autoMeta[key] || ""}
                  onChange={(e) => setCover((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </details>

        <details className="card">
          <summary>格式设置</summary>
          <p className="desc">一般不用改。上传模板后这里会自动更新。</p>
          <div className="form-grid">
            <Select id="numbering" label="标题编号" value={numbering} options={NUMBERING_OPTIONS.map(([v, t]) => [t, v])} onChange={setNumbering} />
            <Select id="lineSpacing" label="行距" value={style.lineSpacing} options={LINE_OPTIONS} onChange={(v) => updateStyle("lineSpacing", v)} />
            <Select id="bodyFont" label="正文字体" value={style.bodyFont} options={FONT_OPTIONS} onChange={(v) => updateStyle("bodyFont", v)} />
            <Select id="bodySize" label="正文字号" value={style.bodySize} options={SIZE_OPTIONS} onChange={(v) => updateStyle("bodySize", v)} />
            <Select id="headingFont" label="标题字体" value={style.headingFont} options={FONT_OPTIONS} onChange={(v) => updateStyle("headingFont", v)} />
            <Select id="headingSize" label="一级标题字号" value={style.headingSize} options={SIZE_OPTIONS} onChange={(v) => updateStyle("headingSize", v)} />
            <Select id="smallHeadingSize" label="二、三级标题字号" value={style.smallHeadingSize} options={SIZE_OPTIONS} onChange={(v) => updateStyle("smallHeadingSize", v)} />
            <label className="field" htmlFor="englishFont">
              <span>英文和数字字体</span>
              <input id="englishFont" value={style.englishFont} onChange={(e) => updateStyle("englishFont", e.target.value)} />
            </label>
          </div>
        </details>

        <details className="card">
          <summary>结构识别结果</summary>
          <p className="desc">每一行被识别成了什么。识别错了就在左侧改原文，比如给标题加上「一、」或「1.1」。</p>
          <div className="structure">
            {structure
              .filter((item) => item.type !== "空行")
              .slice(0, 80)
              .map((item) => (
                <div className="structure-item" key={item.index}>
                  <span>{item.type}</span>
                  <p>{item.text}</p>
                </div>
              ))}
          </div>
        </details>
      </section>

      <footer className="footer muted">
        规则识别，不调用任何 AI 接口。导出后请对照学校最新格式要求再检查一遍。
      </footer>
    </main>
  );
}
