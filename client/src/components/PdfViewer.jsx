import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import workerURL from "pdfjs-dist/build/pdf.worker.min.js?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerURL;

import * as pdfjsViewer from "pdfjs-dist/web/pdf_viewer.js";
import "pdfjs-dist/web/pdf_viewer.css";

const PdfViewer = forwardRef(({ pdfUrl }, ref) => {
  const containerRef = useRef(null);
  const pageReady = useRef(new Map());
  const eventBusRef = useRef(null);
  const pagesRef = useRef([]);           // per-page plain text (normalized)
  const corpusRef = useRef([]);           // line corpus with coords + segments
  const viewportsRef = useRef(new Map()); // pageNum -> viewport used

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
        pagesRef.current = [];
        corpusRef.current = [];
        viewportsRef.current.clear();
        eventBusRef.current = new pdfjsViewer.EventBus();

        const scale = 1.5;

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const defaultViewport = page.getViewport({ scale, rotation: page.rotate });

          const pageView = new pdfjsViewer.PDFPageView({
            container,
            id: pageNum,
            scale,
            defaultViewport,
            eventBus: eventBusRef.current,
          });

          await pageView.setPdfPage(page);
          await pageView.draw();

          // Save viewport for rect conversions
          viewportsRef.current.set(pageNum, defaultViewport);

          // Extract text and build line corpus
          try {
            const textContent = await page.getTextContent({ normalizeWhitespace: true });
            // Simple per-page normalized text
            const normalized = (textContent.items || [])
              .map(it => it.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            pagesRef.current.push({ page: pageNum, text: normalized });

            // Line corpus with segments and character offsets on the unnormalized join (single-space join)
            const lines = [];
            let current = null;
            let lineCounter = 0;
            let accumLen = 0; // current line text length
            for (const item of textContent.items) {
              const tx = item.transform || [1,0,0,1,0,0];
              const x = tx[4] || 0;
              const y = tx[5] || 0;
              const w = item.width || 0;
              const h = (item.height != null) ? item.height : Math.max(Math.abs(tx[3] || 0), 10);
              const str = item.str || "";

              if (!current) {
                current = { id: `${pageNum}-${lineCounter++}`, text: str, x, y, width: w, height: h, pageNum, segments: [] };
                current.segments.push({ str, x, y, width: w, height: h, start: 0, end: str.length - 1 });
                accumLen = str.length;
              } else if (Math.abs(current.y - y) <= 3) { // same line tolerance
                // account for a single space between items
                const start = accumLen + 1;
                const end = start + str.length - 1;
                const rightEdge = Math.max(current.x + current.width, x + w);
                current.width = rightEdge - current.x;
                current.text += " " + str;
                current.height = Math.max(current.height, h);
                current.segments.push({ str, x, y, width: w, height: h, start, end });
                accumLen = end + 1;
              } else {
                lines.push(current);
                current = { id: `${pageNum}-${lineCounter++}`, text: str, x, y, width: w, height: h, pageNum, segments: [] };
                current.segments.push({ str, x, y, width: w, height: h, start: 0, end: str.length - 1 });
                accumLen = str.length;
              }
            }
            if (current) lines.push(current);
            for (const l of lines) {
              // Keep text exactly as constructed to preserve segment indices
              const t = l.text || "";
              if (t.length > 0) corpusRef.current.push({ ...l, text: t });
            }
          } catch (e) {
            console.warn("TextContent error on page", pageNum, e);
            pagesRef.current.push({ page: pageNum, text: "" });
          }

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
    getPages() { return pagesRef.current.slice(); },
    getCorpus() { return corpusRef.current.slice(); },

    async highlight(match) {
      if (!match) return;
      const pageNum = Number(match.page ?? match.pageNum);
      if (!pageNum) return;

      // Wait for text layer ready
      for (let i = 0; i < 30 && !pageReady.current.get(pageNum); i++) {
        await new Promise(r => setTimeout(r, 50));
      }

      const pageDiv = containerRef.current.querySelector(`.page[data-page-number='${pageNum}']`) ||
                      containerRef.current.querySelector(`div[data-page-number='${pageNum}']`);
      if (!pageDiv) return;

            // Highlight by segments if we have a lineId and indices\n      if (match.lineId && (typeof match.start === 'number') && (typeof match.end === 'number')) {\n        const line = corpusRef.current.find(l => l.id === String(match.lineId));\n        const vp = viewportsRef.current.get(pageNum);\n        if (line && vp && Array.isArray(line.segments)) {\n          const segs = line.segments.filter(s => !(s.end < match.start || s.start > match.end));\n          if (segs.length > 0) {\n            let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;\n            for (const s of segs) {\n              const pt = pdfjsLib.Util.applyTransform([s.x, s.y], vp.transform);\n              const vx = pt[0];\n              const vy = pt[1];\n              const vw = s.width * vp.scale;\n              const vh = s.height * vp.scale;\n              const segLeft = vx;\n              const segTop = vy - vh;\n              const segRight = vx + vw;\n              const segBottom = vy;\n              if (segLeft < left) left = segLeft;\n              if (segTop < top) top = segTop;\n              if (segRight > right) right = segRight;\n              if (segBottom > bottom) bottom = segBottom;\n            }\n            pageDiv.querySelectorAll('.search-highlight').forEach(el => el.remove());\n            const hl = document.createElement('div');\n            hl.className = 'search-highlight';\n            hl.style.position = 'absolute';\n            hl.style.background = 'rgba(255, 235, 59, 0.45)';\n            hl.style.border = '1px solid rgba(255, 193, 7, 0.8)';\n            hl.style.left = ${left}px;\n            hl.style.top = ${top}px;\n            hl.style.width = ${right - left}px;\n            hl.style.height = ${bottom - top}px;\n            pageDiv.appendChild(hl);\n            hl.scrollIntoView({ behavior: 'smooth', block: 'center' });\n            setTimeout(() => hl.remove(), 6000);\n            return;\n          }\n        }\n      }\n      }

            // If we have direct coordinates, compute viewport rect via transform matrix\n      if (match.x != null && match.y != null) {\n        pageDiv.querySelectorAll('.search-highlight').forEach(el => el.remove());\n        const vp = viewportsRef.current.get(pageNum);\n        if (vp) {\n          const x = match.x || 0;\n          const y = match.y || 0;\n          const w = match.width || 50;\n          const h = match.height || 12;\n          try {\n            const pt = pdfjsLib.Util.applyTransform([x, y], vp.transform);\n            const vx = pt[0];\n            const vy = pt[1];\n            const vw = w * vp.scale;\n            const vh = h * vp.scale;\n            const hl = document.createElement('div');\n            hl.className = 'search-highlight';\n            hl.style.position = 'absolute';\n            hl.style.background = 'rgba(255, 235, 59, 0.45)';\n            hl.style.border = '1px solid rgba(255, 193, 7, 0.8)';\n            hl.style.left = ${vx}px;\n            hl.style.top = ${vy - vh}px;\n            hl.style.width = ${vw}px;\n            hl.style.height = ${vh}px;\n            pageDiv.appendChild(hl);\n            hl.scrollIntoView({ behavior: 'smooth', block: 'center' });\n            setTimeout(() => hl.remove(), 6000);\n            return;\n          } catch (e) {\n            console.warn('Rect highlight failed', e);\n          }\n        }\n      }\n      }

      // Fallback to text mark
      const textLayer = pageDiv.querySelector('.textLayer');
      if (!textLayer) return;
      const needle = (match.matchText || match.text || match.needle || '').trim();
      if (!needle) return;
      const snippet = needle.toLowerCase();

      textLayer.querySelectorAll('mark.highlit').forEach(m => {
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
          const mark = document.createElement('mark'); mark.className = 'highlit'; mark.textContent = mid;
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
                const mark = document.createElement('mark'); mark.className = 'highlit'; mark.textContent = mid;
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

      const firstMark = pageDiv.querySelector('mark.highlit');
      if (firstMark) firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  }));

  return <div ref={containerRef} className="pdfViewer" style={{ position: "relative" }} />;
});

export default PdfViewer;