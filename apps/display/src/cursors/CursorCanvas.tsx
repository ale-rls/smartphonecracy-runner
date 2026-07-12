import { useEffect, useRef } from "react";
import type { CursorField } from "./cursorField.js";

/**
 * Canvas cursor layer (plan §9): draws interpolated cursors with
 * fading trails. The trail effect comes from painting a translucent
 * clear each frame instead of a full clear, so movement leaves a
 * naturally decaying wake without per-cursor history buffers.
 */
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
      // Fade previous frame slightly -> trails. Full clear while frozen
      // so the frozen field stays crisp during the freeze hold.
      if (field.isFrozen) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }

      const radius = Math.max(6, Math.round(height * 0.008));
      for (const cursor of field.renderAt(performance.timeOrigin + performance.now())) {
        const cx = cursor.x * width;
        const cy = cursor.y * height;
        ctx.fillStyle = cursor.color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        if (cursor.halo !== null) {
          // Expanding join halo (plan §10).
          ctx.strokeStyle = cursor.color;
          ctx.globalAlpha = 1 - cursor.halo;
          ctx.lineWidth = 2 * devicePixelRatio;
          ctx.beginPath();
          ctx.arc(cx, cy, radius + cursor.halo * radius * 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
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
