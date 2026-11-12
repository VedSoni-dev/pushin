"use client";
// The editor: preview with the camera pushing in, a timeline of zooms you can change, the look, and export.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mark } from "./Mark";
import { Caption } from "./Caption";
import { cameraAt, keyframes, measureActivity, newZoom, segmentsFrom, type Camera, type Zoom } from "@/lib/zoom";
import { drawFrame, frameRect, GRADIENTS, cssGradient, outputSize, type Aspect, type Look } from "@/lib/render";
import { download, extFor, loadVideo, pickMime } from "@/lib/media";
import { rememberLook, saveClip, type Clip } from "@/lib/store";

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Graph = { ac: AudioContext; speakers: GainNode; dest: MediaStreamAudioDestinationNode };

export function Editor({ clip: initial, onClose }: { clip: Clip; onClose: () => void }) {
  const [clip, setClip] = useState<Clip>(initial);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImage = useRef<HTMLImageElement | null>(null);
  const graph = useRef<Graph | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<number | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const exportAbort = useRef(false);
  const { look, zooms, duration, trim } = clip;
  const keys = useMemo(() => keyframes(zooms), [zooms]);
  const size = outputSize(look.aspect);
  const sel = zooms.find((z) => z.id === selected) ?? null;

  const update = useCallback((patch: Partial<Clip>) => setClip((c) => ({ ...c, ...patch, updated: Date.now() })), []);
  const setLook = (patch: Partial<Look>) => { const l = { ...look, ...patch }; update({ look: l }); rememberLook(l); };
  const setZoom = (id: string, patch: Partial<Zoom>) => update({ zooms: zooms.map((z) => (z.id === id ? { ...z, ...patch, auto: false } : z)) });

  // save edits to this browser (debounced)
  useEffect(() => {
    const t = setTimeout(() => { void saveClip(clip).catch(() => {}); }, 700);
    return () => clearTimeout(t);
  }, [clip]);

  // draw one frame
  const draw = useCallback((force?: Camera) => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const cam = force ?? cameraAt(keys, v.currentTime);
    drawFrame(ctx, v, v.videoWidth, v.videoHeight, look, cam, bgImage.current);
  }, [keys, look]);

  // load the clip
  useEffect(() => {
    const v = videoRef.current!;
    const url = URL.createObjectURL(initial.blob);
    let gone = false;
    void loadVideo(v, url).then(async (d) => {
      if (gone) return;
      v.muted = false;
      v.currentTime = initial.trim[0];
      setReady(true);
      if (!initial.analyzed) void analyze(d || initial.duration);
    }).catch((e) => setError(e instanceof Error ? e.message : "Couldn't play this clip."));
    return () => { gone = true; v.pause(); URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = async (d: number) => {
    const v = videoRef.current!;
    setAnalysis(0);
    setError(null);
    try {
      const samples = await measureActivity(v, d, (p) => setAnalysis(p));
      const found = segmentsFrom(samples, d);
      v.currentTime = trim[0];
      setClip((c) => ({ ...c, zooms: [...c.zooms.filter((z) => !z.auto), ...found].sort((a, b) => a.start - b.start), analyzed: true, updated: Date.now() }));
      setNote(found.length ? `Found ${found.length} spot${found.length === 1 ? "" : "s"} where the action is. Press play.` : "No small, local action found (big changes like scrolling don't zoom). Add a zoom at the playhead.");
    } finally {
      setAnalysis(null);
    }
  };

  // thumbnail once there is a frame and zooms
  useEffect(() => {
    if (!ready || clip.thumb || analysis !== null) return;
    const v = videoRef.current!;
    const c = document.createElement("canvas");
    const s = outputSize(look.aspect, 480);
    c.width = s.w; c.height = s.h;
    const t = setTimeout(() => {
      const ctx = c.getContext("2d");
      if (!ctx || !v.videoWidth) return;
      drawFrame(ctx, v, v.videoWidth, v.videoHeight, look, { x: 0.5, y: 0.5, scale: 1 }, bgImage.current);
      try { update({ thumb: c.toDataURL("image/jpeg", 0.75) }); } catch { /* tainted */ }
    }, 400);
    return () => clearTimeout(t);
  }, [ready, analysis, clip.thumb, look, update]);

  // the render loop
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v) {
        if (exporting === null && !v.paused && v.currentTime >= trim[1]) { v.pause(); v.currentTime = trim[0]; }
        setTime(v.currentTime);
        if (exporting === null) draw(sel && v.paused ? { x: 0.5, y: 0.5, scale: 1 } : undefined);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, trim, sel, exporting]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || exporting !== null) return;
    if (v.paused) {
      if (v.currentTime < trim[0] || v.currentTime >= trim[1] - 0.05) v.currentTime = trim[0];
      setSelected(null);
      void v.play().catch(() => { v.muted = true; void v.play(); });
    } else v.pause();
  }, [trim, exporting]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = () => setPlaying(!v.paused);
    v.addEventListener("play", on); v.addEventListener("pause", on);
    return () => { v.removeEventListener("play", on); v.removeEventListener("pause", on); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) { update({ zooms: zooms.filter((z) => z.id !== selected) }); setSelected(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, selected, zooms, update]);

  const seek = (t: number) => { const v = videoRef.current; if (v) v.currentTime = clamp(t, 0, duration); };

  // ---------- export ----------
  const exportVideo = async () => {
    const v = videoRef.current!, c = canvasRef.current!;
    const mime = pickMime();
    if (!mime || !("captureStream" in c)) { setError("This browser can't export video. Try Chrome, Edge, Firefox or Safari 18+."); return; }
    setError(null);
    setSelected(null);
    exportAbort.current = false;
    v.pause();
    if (!graph.current) {
      try {
        const ac = new AudioContext();
        const src = ac.createMediaElementSource(v);
        const speakers = ac.createGain();
        const dest = ac.createMediaStreamDestination();
        src.connect(speakers).connect(ac.destination);
        src.connect(dest);
        graph.current = { ac, speakers, dest };
      } catch { graph.current = null; }
    }
    const g = graph.current;
    if (g) { await Promise.race([g.ac.resume(), wait(1500)]); g.speakers.gain.value = 0; }
    v.muted = false;
    const stream = c.captureStream(60);
    const audio = g?.dest.stream.getAudioTracks()[0];
    if (audio) stream.addTrack(audio);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
    if (Math.abs(v.currentTime - trim[0]) > 0.001) {
      const seeked = new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      v.currentTime = trim[0];
      await Promise.race([seeked, wait(2000)]);
    }
    setExporting(0);
    draw();
    rec.start(250);
    try { await v.play(); } catch { v.muted = true; await v.play().catch(() => {}); }
    let stalled = false;
    await new Promise<void>((resolve) => {
      const step = () => {
        if (exportAbort.current || v.currentTime >= trim[1] || v.ended) { resolve(); return; }
        if (v.paused) { stalled = true; resolve(); return; }
        draw();
        setExporting((v.currentTime - trim[0]) / Math.max(0.01, trim[1] - trim[0]));
        requestAnimationFrame(step);
      };
      step();
    });
    v.pause();
    rec.stop();
    await stopped;
    stream.getVideoTracks().forEach((t) => t.stop());
    if (g) g.speakers.gain.value = 1;
    v.muted = false;
    setExporting(null);
    v.currentTime = trim[0];
    if (exportAbort.current) { setNote("Export cancelled."); return; }
    if (stalled) { setError("The video stopped playing during export (the browser paused it). Click Export again and keep this tab in front."); return; }
    const blob = new Blob(parts, { type: mime.split(";")[0] });
    const name = (clip.name || "pushin").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "pushin";
    download(blob, `${name}.${extFor(mime)}`);
    setNote(`Exported ${size.w}×${size.h} ${extFor(mime).toUpperCase()} (${(blob.size / 1e6).toFixed(1)} MB). It's in your downloads.`);
  };

  // ---------- timeline drag ----------
  const trackRef = useRef<HTMLDivElement>(null);
  const tAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * duration, 0, duration);
  };
  const dragZoom = (e: React.PointerEvent, z: Zoom, mode: "move" | "start" | "end") => {
    e.stopPropagation();
    e.preventDefault();
    setSelected(z.id);
    const t0 = tAt(e.clientX), s0 = z.start, e0 = z.end;
    const others = zooms.filter((o) => o.id !== z.id);
    const move = (ev: PointerEvent) => {
      const dt = tAt(ev.clientX) - t0;
      let start = s0, end = e0;
      if (mode === "move") { const len = e0 - s0; start = clamp(s0 + dt, 0, duration - len); end = start + len; }
      if (mode === "start") start = clamp(s0 + dt, 0, e0 - 0.8);
      if (mode === "end") end = clamp(e0 + dt, s0 + 0.8, duration);
      setClip((c) => ({ ...c, zooms: [...others, { ...z, start, end, auto: false }].sort((a, b) => a.start - b.start), updated: Date.now() }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const dragTrim = (e: React.PointerEvent, which: 0 | 1) => {
    e.stopPropagation();
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const t = tAt(ev.clientX);
      setClip((c) => {
        const tr: [number, number] = [...c.trim];
        if (which === 0) tr[0] = clamp(t, 0, tr[1] - 0.5); else tr[1] = clamp(t, tr[0] + 0.5, c.duration);
        return { ...c, trim: tr, updated: Date.now() };
      });
      seek(t);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------- focus dot on the preview ----------
  const stageRef = useRef<HTMLDivElement>(null);
  const v = videoRef.current;
  const rect = v?.videoWidth ? frameRect(size.w, size.h, v.videoWidth, v.videoHeight, look) : null;
  const dragFocus = (e: React.PointerEvent) => {
    if (!sel || !rect) return;
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const b = stageRef.current!.getBoundingClientRect();
      const px = ((ev.clientX - b.left) / b.width) * size.w, py = ((ev.clientY - b.top) / b.height) * size.h;
      setZoom(sel.id, { x: clamp((px - rect.x) / rect.w, 0, 1), y: clamp((py - rect.y) / rect.h, 0, 1) });
    };
    move(e.nativeEvent);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const addZoom = () => {
    const z = newZoom(time, duration);
    update({ zooms: [...zooms, z].sort((a, b) => a.start - b.start) });
    setSelected(z.id);
    videoRef.current?.pause();
  };

  const busy = analysis !== null || exporting !== null;
  const pct = (t: number) => `${(t / Math.max(0.001, duration)) * 100}%`;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-[var(--line)]">
        <button className="btn btn-sm btn-ghost" onClick={onClose} disabled={exporting !== null} aria-label="Back to your clips">← Clips</button>
        <a href="/" className="brand hidden sm:inline-flex"><Mark size={18} /></a>
        <input
          className="flex-1 min-w-0 bg-transparent border-0 font-semibold text-[15px] px-1 py-1 rounded focus:outline-2"
          value={clip.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Clip name"
        />
        {clip.example && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-2)] muted">sample</span>}
        <button className="btn btn-sm btn-primary" onClick={() => void exportVideo().catch((e) => { setExporting(null); setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`); })} disabled={!ready || busy}>Export {pickMimeLabel()}</button>
      </header>

      <div className="flex-1 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-3 sm:p-6 flex flex-col gap-4 min-w-0">
          <div className="rounded-2xl bg-[var(--stage)] p-2 sm:p-5 grid place-items-center">
            <div
              ref={stageRef}
              className="relative w-full"
              style={{ aspectRatio: `${size.w} / ${size.h}`, maxHeight: "62vh", maxWidth: `calc(62vh * ${size.w / size.h})` }}
            >
              <canvas ref={canvasRef} width={size.w} height={size.h} className="absolute inset-0 w-full h-full rounded-lg shadow-lg" onClick={() => !sel && togglePlay()} />
              {sel && rect && (
                <>
                  <div
                    className="absolute border-2 border-white/90 rounded-md pointer-events-none"
                    style={{
                      left: `${((clamp(rect.x + sel.x * rect.w, size.w / sel.scale / 2, size.w - size.w / sel.scale / 2) - size.w / sel.scale / 2) / size.w) * 100}%`,
                      top: `${((clamp(rect.y + sel.y * rect.h, size.h / sel.scale / 2, size.h - size.h / sel.scale / 2) - size.h / sel.scale / 2) / size.h) * 100}%`,
                      width: `${100 / sel.scale}%`, height: `${100 / sel.scale}%`,
                      boxShadow: "0 0 0 9999px rgba(0,0,0,.35)",
                    }}
                  />
                  <div className="absolute inset-0 cursor-crosshair" onPointerDown={dragFocus} />
                  <div
                    className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-[3px] border-white pointer-events-none"
                    style={{ left: `${((rect.x + sel.x * rect.w) / size.w) * 100}%`, top: `${((rect.y + sel.y * rect.h) / size.h) * 100}%`, background: "var(--accent)", boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}
                  />
                </>
              )}
              {analysis !== null && (
                <div className="absolute inset-0 grid place-items-center bg-black/45 rounded-lg text-white">
                  <div className="text-center px-4">
                    <div className="font-semibold">Finding the action… {Math.round(analysis * 100)}%</div>
                    <div className="mt-3 h-1.5 w-56 max-w-full rounded-full bg-white/25 overflow-hidden mx-auto"><div className="h-full bg-white" style={{ width: `${analysis * 100}%` }} /></div>
                  </div>
                </div>
              )}
              {exporting !== null && (
                <div className="absolute left-3 right-3 bottom-3 flex items-center gap-3 rounded-xl bg-black/70 text-white px-3 py-2 text-sm">
                  <span>Exporting {Math.round(exporting * 100)}% · keep this tab open</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white" style={{ width: `${exporting * 100}%` }} /></div>
                  <button className="underline" onClick={() => { exportAbort.current = true; }}>Cancel</button>
                </div>
              )}
            </div>
          </div>
          {sel && <p className="text-sm muted m-0 -mt-1">Drag on the picture to move where this zoom looks. <button className="underline" onClick={() => setSelected(null)}>Done</button></p>}

          {/* transport */}
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn btn-sm" onClick={togglePlay} disabled={!ready || busy} aria-label={playing ? "Pause" : "Play"} style={{ minWidth: 72 }}>{playing ? "Pause" : "Play"}</button>
            <span className="mono text-xs muted">{fmt(time)} / {fmt(duration)}</span>
            <div className="flex-1" />
            <button className="btn btn-sm" onClick={addZoom} disabled={!ready || busy}>+ Zoom here</button>
            <button className="btn btn-sm btn-ghost" onClick={() => void analyze(duration)} disabled={!ready || busy} title="Run the auto-zoom again (keeps zooms you added or changed)">Find zooms again</button>
          </div>

          {/* timeline */}
          <div>
            <div
              ref={trackRef}
              className="relative h-[86px] rounded-xl border border-[var(--line)] bg-[var(--card)] select-none touch-none overflow-hidden"
              onPointerDown={(e) => { setSelected(null); seek(tAt(e.clientX)); }}
            >
              {/* video strip */}
              <div className="absolute left-0 right-0 top-2 h-8 mx-0" style={{ background: "repeating-linear-gradient(90deg, var(--bg-2) 0 22px, var(--line) 22px 23px)" }} />
              {/* trimmed-out shade */}
              <div className="absolute top-0 bottom-0 left-0 bg-[var(--ink)]/15" style={{ width: pct(trim[0]) }} />
              <div className="absolute top-0 bottom-0 right-0 bg-[var(--ink)]/15" style={{ width: `calc(100% - ${pct(trim[1])})` }} />
              {/* trim handles */}
              {[0, 1].map((i) => (
                <div key={i} role="slider" aria-label={i ? "Trim end" : "Trim start"} aria-valuenow={trim[i]} aria-valuemin={0} aria-valuemax={duration}
                  className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize grid place-items-center z-10"
                  style={{ left: pct(trim[i]) }} onPointerDown={(e) => dragTrim(e, i as 0 | 1)}>
                  <div className="w-1.5 h-10 rounded-full bg-[var(--ink)]" />
                </div>
              ))}
              {/* zoom chips */}
              {zooms.map((z) => (
                <div key={z.id}
                  className={`absolute bottom-2 h-9 rounded-lg flex items-center text-[11px] font-semibold cursor-grab z-[5] ${z.id === selected ? "ring-2 ring-[var(--ink)]" : ""}`}
                  style={{ left: pct(z.start), width: pct(z.end - z.start), background: "var(--accent)", color: "var(--accent-ink)" }}
                  onPointerDown={(e) => dragZoom(e, z, "move")}
                  title="Drag to move, drag the edges to change length, click to edit"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(e) => dragZoom(e, z, "start")} />
                  <span className="px-2.5 truncate pointer-events-none">{z.scale.toFixed(1)}× {z.auto ? "auto" : ""}</span>
                  <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(e) => dragZoom(e, z, "end")} />
                </div>
              ))}
              {/* playhead */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--ink)] pointer-events-none z-20" style={{ left: pct(time) }} />
            </div>
            <div className="flex justify-between text-[11px] muted mono mt-1"><span>trim {fmt(trim[0])}</span><span>{zooms.length} zoom{zooms.length === 1 ? "" : "s"} · Space plays · Delete removes a selected zoom</span><span>{fmt(trim[1])}</span></div>
          </div>
          {note && <p className="text-sm m-0" role="status">{note}</p>}
          {error && <p className="text-sm m-0" role="alert" style={{ color: "var(--err)" }}>{error}</p>}
        </div>

        {/* side panel */}
        <aside className="border-t lg:border-t-0 lg:border-l border-[var(--line)] p-4 sm:p-5 flex flex-col gap-6 lg:max-h-[calc(100dvh-56px)] lg:overflow-y-auto">
          {sel && (
            <section className="rounded-xl border border-[var(--accent)] p-3 bg-[var(--accent-soft)]">
              <div className="flex items-center justify-between"><span className="label" style={{ color: "var(--ink)" }}>Selected zoom</span>
                <button className="text-xs underline" onClick={() => { update({ zooms: zooms.filter((z) => z.id !== sel.id) }); setSelected(null); }}>Delete</button></div>
              <label className="block mt-3 text-sm">How close: <b className="mono">{sel.scale.toFixed(1)}×</b>
                <input type="range" min={1.2} max={3} step={0.1} value={sel.scale} onChange={(e) => setZoom(sel.id, { scale: Number(e.target.value) })} />
              </label>
              <p className="text-xs muted m-0 mt-1 mono">{fmt(sel.start)} → {fmt(sel.end)}</p>
            </section>
          )}
          <section>
            <div className="label mb-2">Background</div>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(GRADIENTS).map(([id, g]) => (
                <button key={id} aria-label={g.name} title={g.name} aria-pressed={look.bg === id}
                  className={`aspect-[4/3] rounded-lg border-2 ${look.bg === id ? "border-[var(--ink)]" : "border-transparent"}`}
                  style={{ background: cssGradient(id) }} onClick={() => setLook({ bg: id })} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <label className={`btn btn-sm ${look.bg === "solid" ? "btn-primary" : ""}`} style={{ cursor: "pointer" }}>
                <input type="color" value={look.solid} onChange={(e) => setLook({ bg: "solid", solid: e.target.value })} className="w-4 h-4 p-0 border-0 bg-transparent" aria-label="Solid colour" /> Solid
              </label>
              <label className={`btn btn-sm ${look.bg === "image" ? "btn-primary" : ""}`} style={{ cursor: "pointer" }}>
                Image
                <input type="file" accept="image/*" hidden onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const img = new Image(); img.onload = () => { bgImage.current = img; setLook({ bg: "image" }); }; img.src = URL.createObjectURL(f);
                }} />
              </label>
              <button className={`btn btn-sm ${look.bg === "blur" ? "btn-primary" : ""}`} onClick={() => setLook({ bg: "blur" })}>Blur</button>
            </div>
            {look.bg === "image" && !bgImage.current && <p className="text-xs muted mt-2">Images aren&apos;t kept between visits. Pick it again.</p>}
          </section>
          <section className="grid gap-3">
            <div className="label">Frame</div>
            <label className="text-sm">Padding<input type="range" min={0} max={0.2} step={0.005} value={look.padding} onChange={(e) => setLook({ padding: Number(e.target.value) })} /></label>
            <label className="text-sm">Corners<input type="range" min={0} max={48} step={1} value={look.radius} onChange={(e) => setLook({ radius: Number(e.target.value) })} /></label>
            <label className="text-sm">Shadow<input type="range" min={0} max={1} step={0.05} value={look.shadow} onChange={(e) => setLook({ shadow: Number(e.target.value) })} /></label>
          </section>
          <section>
            <div className="label mb-2">Shape</div>
            <div className="seg">
              {(["16:9", "4:3", "1:1", "9:16"] as Aspect[]).map((a) => (
                <button key={a} aria-pressed={look.aspect === a} onClick={() => setLook({ aspect: a })}>{a}</button>
              ))}
            </div>
            <p className="text-xs muted mt-2 mb-0">Exports at {size.w}×{size.h}. Export plays the clip once in real time{trim[1] - trim[0] > 0 ? ` (${Math.round(trim[1] - trim[0])} s)` : ""}; keep the tab in front.</p>
          </section>
          <Caption clip={clip} onTitle={(name) => update({ name })} />
        </aside>
      </div>
      <video ref={videoRef} className="fixed left-0 top-0 w-[2px] h-[2px] opacity-0 pointer-events-none" playsInline preload="auto" aria-hidden />
    </div>
  );
}

function pickMimeLabel() {
  if (typeof window === "undefined") return "";
  const m = pickMime();
  return m ? extFor(m).toUpperCase() : "";
}
