import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import workerURL from "pdfjs-dist/build/pdf.worker.min.js?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerURL;

import { PDFPageView, EventBus } from "pdfjs-dist/web/pdf_viewer.js";
import "pdfjs-dist/web/pdf_viewer.css";

const PdfViewer = forwardRef(({ pdfUrl }, ref) => {
  const containerRef = useRef(null);
  const pageReady = useRef(new Map());
  const eventBusRef = useRef(null);

  useEffect(() => {
    let canceled = false;

    async function load() {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const doc = await loadingTask.promise;
        if (canceled) return;

        const container = containerRef.current;
        container.innerHTML = "";
        pageReady.current.clear();
        eventBusRef.current = new EventBus();

        const scale = 1.5;

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const defaultViewport = page.getViewport({ scale, rotation: page.rotate });

          const pageView = new PDFPageView({
            container,
            id: pageNum,
            scale,
            defaultViewport,
            eventBus: eventBusRef.current,
          });

          await pageView.setPdfPage(page);
          await pageView.draw();

          pageReady.current.set(pageNum, true);
          pageView.div.dataset.pageNumber = String(pageNum);
        }
      } catch (err) {
        console.error("PDF Load Error:", err);
      }
    }

    if (pdfUrl) load();
    return () => {
      canceled = true;
    };
  }, [pdfUrl]);

  useImperativeHandle(ref, () => ({
    async highlight(match) {
      if (!match) return;
      const pageNum = Number(match.page);

      for (let i = 0; i < 30 && !pageReady.current.get(pageNum); i++) {
        await new Promise(r => setTimeout(r, 50));
      }

      const pageDiv = containerRef.current.querySelector(`.page[data-page-number='${pageNum}']`) ||
                      containerRef.current.querySelector(`div[data-page-number='${pageNum}']`);
      if (!pageDiv) return;

      const textLayer = pageDiv.querySelector(".textLayer");
      if (!textLayer) return;

      const needle = (match.matchText || match.text || match.needle || "").trim();
      if (!needle) return;
      const snippet = needle.toLowerCase();

      textLayer.querySelectorAll("mark.highlit").forEach(m => {
        const parent = m.parentNode; if (parent) parent.replaceChild(document.createTextNode(m.textContent), m);
      });

      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, null, false);
      let node, found = null;
      while ((node = walker.nextNode())) {
        const lower = node.nodeValue.toLowerCase();
        const idx = lower.indexOf(snippet);
        if (idx !== -1) {
          const before = node.nodeValue.slice(0, idx);
          const mid = node.nodeValue.slice(idx, idx + snippet.length);
          const after = node.nodeValue.slice(idx + snippet.length);
          const parent = node.parentNode;
          if (before) parent.insertBefore(document.createTextNode(before), node);
          const mark = document.createElement("mark"); mark.className = "highlit"; mark.textContent = mid;
          parent.insertBefore(mark, node);
          if (after) parent.insertBefore(document.createTextNode(after), node);
          parent.removeChild(node);
          found = mark; break;
        }
      }

      if (!found) {
        const words = snippet.split(/\s+/).filter(Boolean);
        if (words.length) {
          const walker2 = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, null, false);
          while ((node = walker2.nextNode())) {
            let text = node.nodeValue; let lower = text.toLowerCase(); let changed = false;
            for (const w of words) {
              const pos = lower.indexOf(w);
              if (pos !== -1) {
                const before = text.slice(0, pos);
                const mid = text.slice(pos, pos + w.length);
                const after = text.slice(pos + w.length);
                const parent = node.parentNode;
                if (before) parent.insertBefore(document.createTextNode(before), node);
                const mark = document.createElement("mark"); mark.className = "highlit"; mark.textContent = mid;
                parent.insertBefore(mark, node);
                if (after) parent.insertBefore(document.createTextNode(after), node);
                parent.removeChild(node);
                changed = true; break;
              }
            }
            if (changed) break;
          }
        }
      }

      const firstMark = pageDiv.querySelector("mark.highlit");
      if (firstMark) firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  }));

  return <div ref={containerRef} className="pdfViewer" style={{ position: "relative" }} />;
});

export default PdfViewer;