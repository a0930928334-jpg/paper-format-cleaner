let pdfModulePromise;

async function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjsLib, workerModule]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjsLib;
    });
  }

  return pdfModulePromise;
}

function textItemsToLines(items) {
  let output = "";

  for (const item of items) {
    const value = String(item.str || "");
    output += value;
    output += item.hasEOL ? "\n" : " ";
  }

  return output
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractDocxText(arrayBuffer) {
  const mammothModule = await import("mammoth");
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

export async function extractPdfText(arrayBuffer, { maxPages = 100 } = {}) {
  const pdfjsLib = await loadPdfModule();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const processedPages = Math.min(totalPages, maxPages);
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= processedPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(textItemsToLines(content.items));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return {
    text: pages.join("\n\n"),
    totalPages,
    processedPages,
    truncated: processedPages < totalPages,
  };
}
