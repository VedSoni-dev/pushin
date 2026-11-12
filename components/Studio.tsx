"use client";
// /app after sign-in: your clips (kept in this browser), a first run that makes your first one, and the editor.
import { useCallback, useEffect, useRef, useState } from "react";
import { Mark } from "./Mark";
import { Editor } from "./Editor";
import { PublikChoice } from "./PublikGate";
import { canRecordScreen, loadVideo, makeExampleClip, record, startScreen, type Recording } from "@/lib/media";
import { deleteClip, getClip, lastLook, listClips, saveClip, type Clip, type ClipMeta } from "@/lib/store";
import { DEFAULT_LOOK } from "@/lib/render";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Studio() {
  const [clips, setClips] = useState<ClipMeta[] | null>(null);
  const [open, setOpen] = useState<Clip | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mic, setMic] = useState(false);
  const [rec, setRec] = useState<{ r: Recording; cleanup: () => void; t0: number } | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [settings, setSettings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const refresh = useCallback(() => listClips().then(setClips).catch(() => { setClips([]); setError("This browser blocked local storage, so clips can't be kept between visits."); }), []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!rec) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [rec]);

  const addBlob = useCallback(async (blob: Blob, name: string, example = false) => {
    setBusy("Reading the video…");
    const v = document.createElement("video");
    const url = URL.createObjectURL(blob);
    try {
      const duration = await loadVideo(v, url);
      if (!duration) throw new Error("That video has no length the browser can read.");
      const clip: Clip = {
        id: uid(), name, created: Date.now(), updated: Date.now(), blob, duration,
        width: v.videoWidth, height: v.videoHeight, zooms: [], analyzed: false,
        look: lastLook() ?? DEFAULT_LOOK, trim: [0, duration], example,
      };
      await saveClip(clip).catch(() => setError("Couldn't save the clip in this browser (storage full or private mode). You can still edit and export it now."));
      setOpen(clip);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that video.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(null);
    }
  }, [refresh]);

  const startRecording = async () => {
    setError(null);
    try {
      const { stream, cleanup } = await startScreen({ mic });
      for (let i = 3; i > 0; i--) { setCount(i); await new Promise((r) => setTimeout(r, 800)); }
      setCount(null);
      const r = record(stream);
      setRec({ r, cleanup, t0: Date.now() });
      setNow(Date.now());
      stream.getVideoTracks()[0]?.addEventListener("ended", () => r.stop());
      const blob = await r.done;
      cleanup();
      setRec(null);
      if (blob.size < 1000) { setError("The recording came back empty. Try again, and pick a screen, window or tab in the browser's picker."); return; }
      const d = new Date();
      await addBlob(blob, `Recording ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
    } catch (e) {
      setCount(null);
      setRec(null);
      const name = e instanceof DOMException ? e.name : "";
      setError(name === "NotAllowedError" ? "Screen sharing was cancelled or blocked. Click Record screen and pick what to share." : e instanceof Error ? e.message : "Recording didn't start.");
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v|mkv)$/i.test(f.name)) { setError("That isn't a video file. Drop an MP4, WebM or MOV."); return; }
    void addBlob(f, f.name.replace(/\.[^.]+$/, ""));
  };

  const example = async () => {
    setError(null);
    setBusy("Recording the example clip (9 s)…");
    try {
      const blob = await makeExampleClip(() => {});
      await addBlob(blob, "Example clip (sample)", true);
    } catch { setError("This browser can't record a canvas, so the example isn't available here."); setBusy(null); }
  };

  const openClip = async (id: string) => {
    setBusy("Opening…");
    const c = await getClip(id).catch(() => undefined);
    setBusy(null);
    if (c) setOpen(c); else setError("That clip is gone from this browser.");
  };

  if (open) return <Editor clip={open} onClose={() => { setOpen(null); void refresh(); }} />;

  const first = clips !== null && clips.length === 0;
  const canRec = typeof window === "undefined" || canRecordScreen();

  return (
    <div
      className="min-h-[100dvh]"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
    >
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-[var(--line)]">
        <a href="/" className="brand"><Mark /> pushin</a>
        <div className="relative">
          <button className="btn btn-sm btn-ghost" onClick={() => setSettings((s) => !s)} aria-expanded={settings}>Settings</button>
          {settings && (
            <div className="absolute right-0 top-10 z-30 w-[300px] rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-xl">
              <PublikChoice />
              <p className="mt-3 text-xs muted">AI is only used to write a title and post for a clip. Recording, zooms and export run in your browser.</p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-4 sm:px-6 py-8 sm:py-12">
        <section className="rise">
          <h1 className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.03em] leading-tight m-0">
            {first ? "Make your first clip" : "Your clips"}
          </h1>
          <p className="muted mt-2 mb-6 max-w-[620px] text-[15px] leading-relaxed">
            {first
              ? "Record your screen, or drop in a recording you already have. pushin finds where the action is and pushes the camera in on it, framed on a background. Your video stays in this browser."
              : "Kept in this browser only. Record another, or drop a video anywhere on this page."}
          </p>

          <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">Record your screen</div>
                  <div className="text-sm muted mt-1">A screen, a window or a browser tab. You pick in the browser&apos;s window.</div>
                </div>
                <button className="btn btn-accent btn-lg" disabled={!canRec || !!busy || !!rec} onClick={() => void startRecording()}>
                  <span className="rec-dot" style={{ animation: "none", background: "currentColor" }} /> Record screen
                </button>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} /> Also record my microphone
              </label>
              {!canRec && <p className="text-sm mt-3" style={{ color: "var(--err)" }}>This browser can&apos;t record the screen (phones and some browsers can&apos;t). Import a video instead.</p>}
            </div>
            <button
              className={`rounded-2xl border border-dashed p-5 text-left transition-colors ${drag ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-transparent hover:bg-[var(--bg-2)]"}`}
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
            >
              <div className="font-semibold">Use a video you have</div>
              <div className="text-sm muted mt-1">Drop an MP4, WebM or MOV here, or click to pick one.</div>
              <input ref={fileRef} type="file" accept="video/*,.mov,.mkv" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </button>
          </div>

          {busy && <p className="mt-4 text-sm flex items-center gap-2" role="status"><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-r-transparent animate-spin" /> {busy}</p>}
          {error && <p className="mt-4 text-sm" role="alert" style={{ color: "var(--err)" }}>{error}</p>}
        </section>

        {first && (
          <section className="mt-10 rise" style={{ animationDelay: ".08s" }}>
            <div className="label mb-3">How it works</div>
            <ol className="grid gap-3 sm:grid-cols-3 list-none p-0 m-0">
              {[
                ["Record or drop a video", "Do the thing you want to show: type, click, open a menu. Small changes in one spot are what the camera follows."],
                ["Watch it zoom by itself", "When you stop, pushin compares the frames, finds where things changed, and puts zooms on the timeline. Drag the dot to move one, or add your own."],
                ["Pick a look, export", "Background, padding, corners, shadow, 16:9, 1:1 or 9:16. Export makes an MP4 (WebM in Firefox) right here."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-2xl border border-[var(--line)] p-4">
                  <div className="mono text-xs" style={{ color: "var(--accent)" }}>0{i + 1}</div>
                  <div className="font-semibold mt-1">{t}</div>
                  <p className="text-sm muted mt-1 mb-0 leading-relaxed">{d}</p>
                </li>
              ))}
            </ol>
            <p className="text-sm muted mt-4">
              Just looking around?{" "}
              <button className="underline underline-offset-2" onClick={() => void example()} disabled={!!busy}>Try it on an example clip</button>{" "}
              (a made-up app we record on the spot, labelled as a sample).
            </p>
          </section>
        )}

        {clips && clips.length > 0 && (
          <section className="mt-10">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
              {clips.map((c) => (
                <li key={c.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
                  <button className="block w-full text-left" onClick={() => void openClip(c.id)}>
                    <div className="aspect-video bg-[var(--stage)] grid place-items-center overflow-hidden">
                      {c.thumb ? <img src={c.thumb} alt="" className="w-full h-full object-cover" /> : <span className="muted text-sm">{fmt(c.duration)}</span>}
                    </div>
                    <div className="p-3">
                      <div className="font-medium truncate">{c.name}{c.example && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-2)] muted">sample</span>}</div>
                      <div className="text-xs muted mt-0.5 mono">{fmt(c.duration)} · {c.zooms.length} zoom{c.zooms.length === 1 ? "" : "s"} · {c.look.aspect}</div>
                    </div>
                  </button>
                  <div className="px-3 pb-3 -mt-1">
                    <button className="text-xs muted underline underline-offset-2" onClick={async () => { if (confirm(`Delete "${c.name}" from this browser?`)) { await deleteClip(c.id); void refresh(); } }}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="px-4 sm:px-6 py-8 text-xs muted text-center">free &amp; open source · not affiliated with Screen Studio · <a href="https://github.com/VedSoni-dev/pushin">source</a></footer>

      {count !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 text-white">
          <div className="text-[120px] font-semibold tracking-tight">{count}</div>
        </div>
      )}
      {rec && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-3 rounded-full bg-[var(--ink)] text-[var(--bg)] pl-4 pr-1.5 py-1.5 shadow-2xl">
          <span className="rec-dot" />
          <span className="mono text-sm">{fmt((now - rec.t0) / 1000)}</span>
          <button className="btn btn-sm btn-accent rounded-full" onClick={() => rec.r.stop()}>Stop</button>
        </div>
      )}
    </div>
  );
}
