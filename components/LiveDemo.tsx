"use client";
// The landing hero: a made-up app recording, played through the real pushin renderer.
// "Raw" shows the flat recording; "pushin" shows the same frames framed and pushed in.
import { useEffect, useRef, useState } from "react";
import { drawScene, SCENE_SECONDS, SCENE_ZOOMS } from "@/lib/scene";
import { cameraAt, keyframes } from "@/lib/zoom";
import { drawFrame, DEFAULT_LOOK } from "@/lib/render";

export function LiveDemo() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [raw, setRaw] = useState(false);
  const [t, setT] = useState(0);
  const rawRef = useRef(raw);
  rawRef.current = raw;

  useEffect(() => {
    const out = ref.current!;
    const octx = out.getContext("2d")!;
    const src = document.createElement("canvas");
    src.width = 1280; src.height = 800;
    const sctx = src.getContext("2d")!;
    const keys = keyframes(SCENE_ZOOMS);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const look = { ...DEFAULT_LOOK, padding: 0.075 };
    let raf = 0;
    const t0 = performance.now();
    let lastT = -1;
    const loop = () => {
      const time = reduce ? 2.6 : (((performance.now() - t0) / 1000) % (SCENE_SECONDS + 0.8));
      drawScene(sctx, time, src.width, src.height);
      if (rawRef.current) {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.fillStyle = "#000";
        octx.fillRect(0, 0, out.width, out.height);
        const s = Math.min(out.width / src.width, out.height / src.height);
        octx.drawImage(src, (out.width - src.width * s) / 2, (out.height - src.height * s) / 2, src.width * s, src.height * s);
      } else {
        drawFrame(octx, src, src.width, src.height, look, cameraAt(keys, time));
      }
      if (Math.abs(time - lastT) > 0.1) { setT(time); lastT = time; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const zooming = SCENE_ZOOMS.some((z) => t >= z.start && t <= z.end);
  return (
    <div className="relative">
      <canvas ref={ref} width={1600} height={900} className="block w-full h-auto rounded-2xl shadow-[0_30px_80px_-30px_rgba(0,0,0,.45)]" aria-label="A screen recording of a notes app being framed on a gradient while the camera pushes in on the typing, then on the publish button" role="img" />
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="seg" style={{ width: 210 }}>
          <button aria-pressed={raw} onClick={() => setRaw(true)}>Raw recording</button>
          <button aria-pressed={!raw} onClick={() => setRaw(false)}>pushin</button>
        </div>
        <div className="flex-1 min-w-[160px] max-w-[420px] h-6 relative rounded-md bg-[var(--bg-2)] overflow-hidden" aria-hidden>
          {SCENE_ZOOMS.map((z) => (
            <div key={z.id} className="absolute top-1 bottom-1 rounded" style={{ left: `${(z.start / (SCENE_SECONDS + 0.8)) * 100}%`, width: `${((z.end - z.start) / (SCENE_SECONDS + 0.8)) * 100}%`, background: "var(--accent)", opacity: raw ? 0.35 : 1 }} />
          ))}
          <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--ink)]" style={{ left: `${(t / (SCENE_SECONDS + 0.8)) * 100}%` }} />
        </div>
        <span className="mono text-xs muted w-[120px] text-right">{raw ? "flat, as recorded" : zooming ? "pushing in on the action" : "full frame"}</span>
      </div>
    </div>
  );
}
