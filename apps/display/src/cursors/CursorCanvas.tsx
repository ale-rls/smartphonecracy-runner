import { useEffect, useRef } from "react";
import type { CursorField } from "./cursorField.js";

/** Canvas cursor layer: draws one crisp dot per interpolated cursor. */
export function CursorCanvas({ field }: { field: CursorField }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const radius = Math.max(6, Math.round(height * 0.008));
      for (const cursor of field.renderAt(performance.timeOrigin + performance.now())) {
        const cx = cursor.x * width;
        const cy = cursor.y * height;
        ctx.fillStyle = cursor.color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [field]);

  return <canvas ref={canvasRef} className="cursor-canvas" />;
}
