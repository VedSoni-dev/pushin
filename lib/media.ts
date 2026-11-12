// Recording, reading and exporting video, all inside the browser.
import { drawScene, SCENE_SECONDS } from "./scene";

export function pickMime(): string {
  const options = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}
export const extFor = (mime: string) => (mime.includes("mp4") ? "mp4" : "webm");

export function canRecordScreen(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined";
}

export type Recording = { stop: () => void; done: Promise<Blob>; stream: MediaStream };

/** Ask the browser for a screen, window or tab (and optionally the mic), then record it. */
export async function startScreen(opts: { mic: boolean }): Promise<{ stream: MediaStream; cleanup: () => void }> {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60 }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    audio: true,
  });
  const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
  const extra: MediaStream[] = [display];
  let ac: AudioContext | null = null;
  let mic: MediaStream | null = null;
  if (opts.mic) {
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); extra.push(mic); } catch { mic = null; }
  }
  const audioIn = [display, mic].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
  if (audioIn.length === 1) tracks.push(audioIn[0].getAudioTracks()[0]);
  else if (audioIn.length > 1) {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    for (const s of audioIn) ac.createMediaStreamSource(s).connect(dest);
    tracks.push(dest.stream.getAudioTracks()[0]);
  }
  return {
    stream: new MediaStream(tracks),
    cleanup: () => { extra.forEach((s) => s.getTracks().forEach((t) => t.stop())); void ac?.close(); },
  };
}

export function record(stream: MediaStream, bitrate = 10_000_000): Recording {
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrate } : { videoBitsPerSecond: bitrate });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const done = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(parts, { type: rec.mimeType || mime || "video/webm" }));
    rec.onerror = () => reject(new Error("The recorder stopped with an error."));
  });
  rec.start(500);
  return { stream, done, stop: () => { if (rec.state !== "inactive") rec.stop(); } };
}

/** Load a blob into a video element and get its real duration (recorded WebM often says Infinity). */
export async function loadVideo(video: HTMLVideoElement, url: string): Promise<number> {
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error("This browser can't play that file. Try an MP4 or WebM.")); };
    const cleanup = () => { video.removeEventListener("loadedmetadata", ok); video.removeEventListener("error", bad); };
    video.addEventListener("loadedmetadata", ok);
    video.addEventListener("error", bad);
  });
  if (!Number.isFinite(video.duration) || video.duration === 0) {
    await new Promise<void>((resolve) => {
      const done = () => { video.removeEventListener("durationchange", check); resolve(); };
      const check = () => { if (Number.isFinite(video.duration) && video.duration > 0) done(); };
      video.addEventListener("durationchange", check);
      video.currentTime = 1e7;
      setTimeout(done, 4000);
    });
  }
  video.currentTime = 0;
  await new Promise((r) => setTimeout(r, 50));
  const d = video.duration;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** Record our own made-up app for ~9 s (the optional example, clearly labelled). */
export async function makeExampleClip(onProgress: (p: number) => void): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 800;
  const ctx = c.getContext("2d")!;
  drawScene(ctx, 0, c.width, c.height);
  const stream = c.captureStream(30);
  const r = record(stream, 6_000_000);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawScene(ctx, t, c.width, c.height);
      onProgress(Math.min(1, t / SCENE_SECONDS));
      if (t < SCENE_SECONDS) setTimeout(tick, 1000 / 30); else resolve();
    };
    tick();
  });
  r.stop();
  stream.getTracks().forEach((t) => t.stop());
  return r.done;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
