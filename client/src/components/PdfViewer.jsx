import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// Correct Vite-compatible worker import
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import workerURL from "pdfjs-dist/build/pdf.worker.min.js?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerURL;

import "pdfjs-dist/web/pdf_viewer.css";

const PdfViewer = forwardRef(({ pdfUrl }, ref) => {
  const containerRef = useRef(null);

  useEffect(() => {
    let canceled = false;

    async function load() {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const doc = await loadingTask.promise;
        if (canceled) return;

        const container = containerRef.current;
        container.innerHTML = "";

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          // --- PAGE WRAPPER ---
          const pageDiv = document.createElement("div");
          pageDiv.className = "page";
          pageDiv.dataset.pageNumber = pageNum;
          pageDiv.style.position = "relative";
          pageDiv.style.marginBottom = "20px";

          // --- CANVAS ---
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          pageDiv.appendChild(canvas);

          // --- TEXT LAYER DIV ---
          const textLayerDiv = document.createElement("div");
          textLayerDiv.className = "textLayer";
          textLayerDiv.style.position = "absolute";
          textLayerDiv.style.left = "0";
          textLayerDiv.style.top = "0";
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;
          pageDiv.appendChild(textLayerDiv);

          container.appendChild(pageDiv);

          // --- RENDER PAGE ---
          await page.render({ canvasContext: ctx, viewport }).promise;

          // --- RENDER REAL TEXT LAYER (Edge-style highlight) ---
          const textContent = await page.getTextContent();
          pdfjsLib.renderTextLayer({
            textContent,
            container: textLayerDiv,
            viewport,
            textDivs: [],
          });
        }
      } catch (error) {
        console.error("PDF Load Error:", error);
      }
    }

    load();
    return () => {
      canceled = true;
    };
  }, [pdfUrl]);

  // --- PUBLIC HIGHLIGHT API ---
  useImperativeHandle(ref, () => ({
    highlight(match) {
      if (!match) return;

      const pageDiv = containerRef.current.querySelector(
        `.page[data-page-number='${match.page}']`
      );
      if (!pageDiv) return;

      const textLayer = pageDiv.querySelector(".textLayer");
      if (!textLayer) return;

      const snippet = match.text.toLowerCase();

      // Remove old marks
      textLayer.querySelectorAll("mark.highlit").forEach((m) => {
        const parent = m.parentNode;
        parent.replaceChild(document.createTextNode(m.textContent), m);
      });

      const walker = document.createTreeWalker(
        textLayer,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while ((node = walker.nextNode())) {
        const lower = node.nodeValue.toLowerCase();
        const idx = lower.indexOf(snippet);

        if (idx !== -1) {
          const before = node.nodeValue.slice(0, idx);
          const matchText = node.nodeValue.slice(idx, idx + snippet.length);
          const after = node.nodeValue.slice(idx + snippet.length);

          const parent = node.parentNode;

          if (before) parent.insertBefore(document.createTextNode(before), node);

          const mark = document.createElement("mark");
          mark.className = "highlit";
          mark.textContent = matchText;
          parent.insertBefore(mark, node);

          if (after) parent.insertBefore(document.createTextNode(after), node);

          parent.removeChild(node);

          mark.scrollIntoView({ behavior: "smooth", block: "center" });

          return;
        }
      }
    },
  }));

  return <div ref={containerRef} style={{ position: "relative" }} />;
});

export default PdfViewer;
