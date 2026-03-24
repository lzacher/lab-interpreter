import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Configure worker — use CDN to avoid bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs";

interface PdfPageCanvasProps {
  /** ArrayBuffer of the PDF file */
  pdfData: ArrayBuffer;
  /** 1-based page number */
  pageNumber: number;
  /** Rendered width in pixels (height is auto-calculated) */
  width?: number;
  className?: string;
}

/**
 * Renders a single PDF page directly in the browser using PDF.js.
 * No server-side conversion needed — works with any PDF type including
 * embedded fonts, hospital system exports, and scanned documents.
 */
export function PdfPageCanvas({
  pdfData,
  pageNumber,
  width = 200,
  className,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!canvasRef.current) return;
      setLoading(true);
      setError(false);

      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.floor(scaledViewport.width);
        canvas.height = Math.floor(scaledViewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx as any, viewport: scaledViewport, canvas } as any).promise;

        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error(`[PdfPageCanvas] render error page ${pageNumber}:`, err);
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfData, pageNumber, width]);

  return (
    <div className={className} style={{ position: "relative", display: "inline-block" }}>
      {loading && (
        <div
          style={{
            width,
            height: Math.round(width * 1.414), // A4 aspect ratio placeholder
            background: "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: "3px solid #cbd5e1",
              borderTopColor: "#3b82f6",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: loading ? "none" : "block",
          borderRadius: 4,
          maxWidth: "100%",
        }}
      />
      {error && (
        <div
          style={{
            width,
            height: Math.round(width * 1.414),
            background: "#fef2f2",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            color: "#ef4444",
            fontSize: 12,
            gap: 4,
          }}
        >
          <span style={{ fontSize: 24 }}>⚠</span>
          <span>Erro ao renderizar</span>
        </div>
      )}
    </div>
  );
}
