// Auto-zoom: find where the pixels change in a recording and turn that into zoom segments,
// then turn segments into a smooth camera (eased push-in, hold, push-out; the centre never jitters).

export type Zoom = { id: string; start: number; end: number; x: number; y: number; scale: number; auto: boolean };
export type Camera = { x: number; y: number; scale: number };
type Sample = { t: number; x: number; y: number; w: number; h: number; amount: number };

export const RAMP_IN = 0.75; // seconds of push-in
export const RAMP_OUT = 0.8; // seconds of push-out
const SAMPLE_W = 160;
const uid = () => Math.random().toString(36).slice(2, 10);

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.currentTime = t;
    setTimeout(done, 1500); // a stuck seek never stalls the analysis
  });
}

/** Sample the video, diff each frame against the last, and return the activity per sample. */
export async function measureActivity(
  video: HTMLVideoElement,
  duration: number,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<Sample[]> {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const w = SAMPLE_W, h = Math.max(16, Math.round((SAMPLE_W * vh) / vw));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const step = Math.max(0.125, duration / 900);
  let prev: Uint8ClampedArray | null = null;
  const out: Sample[] = [];
  for (let t = 0; t < duration; t += step) {
    if (signal?.aborted) break;
    await seek(video, Math.min(t, Math.max(0, duration - 0.05)));
    ctx.drawImage(video, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    if (prev) {
      let n = 0, sx = 0, sy = 0, minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const d = Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]);
          if (d > 60) {
            n++; sx += x; sy += y;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      const amount = n / (w * h);
      if (n >= 3) out.push({ t, x: sx / n / w, y: sy / n / h, w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h, amount });
    }
    prev = px;
    onProgress(Math.min(1, t / duration));
  }
  onProgress(1);
  return out;
}

/** Turn activity samples into zoom segments. Whole-screen changes (scrolls, page loads) never zoom. */
export function segmentsFrom(samples: Sample[], duration: number): Zoom[] {
  const local = samples.filter((s) => s.amount < 0.28 && s.w * s.h < 0.45);
  type Group = { first: number; last: number; pts: Sample[] };
  const groups: Group[] = [];
  for (const s of local) {
    const g = groups[groups.length - 1];
    if (g && s.t - g.last < 1.1) {
      const cx = wmean(g.pts, "x"), cy = wmean(g.pts, "y");
      if (Math.hypot(s.x - cx, s.y - cy) < 0.22) { g.pts.push(s); g.last = s.t; continue; }
    }
    groups.push({ first: s.t, last: s.t, pts: [s] });
  }
  const zooms: Zoom[] = [];
  for (const g of groups) {
    if (g.pts.length < 2 && g.pts[0].amount < 0.002) continue; // a single flicker
    const x = wmedian(g.pts, "x"), y = wmedian(g.pts, "y");
    // how big the action is decides how far to push: small typing → close, a panel changing → wider
    const spanW = Math.max(...g.pts.map((p) => p.x + p.w / 2)) - Math.min(...g.pts.map((p) => p.x - p.w / 2));
    const spanH = Math.max(...g.pts.map((p) => p.y + p.h / 2)) - Math.min(...g.pts.map((p) => p.y - p.h / 2));
    const fit = 0.85 / Math.max(spanW, spanH * 1.0, 0.05);
    const scale = round1(clamp(fit, 1.5, 2.2));
    const start = Math.max(0, g.first - 0.45);
    const end = Math.min(duration, Math.max(g.last + 1.1, start + RAMP_IN + 1.2));
    zooms.push({ id: uid(), start, end, x, y, scale, auto: true });
  }
  // merge: overlapping or touching segments become one (same place) or are made back to back (different place)
  const merged: Zoom[] = [];
  for (const z of zooms) {
    const p = merged[merged.length - 1];
    if (p && z.start <= p.end + 0.3) {
      if (Math.hypot(z.x - p.x, z.y - p.y) < 0.12) { p.end = Math.max(p.end, z.end); p.scale = Math.max(p.scale, z.scale); continue; }
      z.start = Math.max(z.start, p.end);
      if (z.end - z.start < 1) continue;
    }
    merged.push(z);
  }
  return merged.filter((z) => z.end - z.start >= 1.2);
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
function wmean(pts: Sample[], k: "x" | "y") {
  let s = 0, n = 0;
  for (const p of pts) { const wt = Math.sqrt(p.amount) + 1e-4; s += p[k] * wt; n += wt; }
  return s / n;
}
function wmedian(pts: Sample[], k: "x" | "y") {
  const v = pts.map((p) => p[k]).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

// ---------- camera ----------
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // ease-in-out cubic: starts and lands at rest
const FULL: Camera = { x: 0.5, y: 0.5, scale: 1 };
type Key = { t: number; c: Camera };

/** Keyframes for the whole clip: rest → push in → hold → (pan to the next spot, or push out). */
export function keyframes(zooms: Zoom[]): Key[] {
  const z = [...zooms].sort((a, b) => a.start - b.start);
  const keys: Key[] = [{ t: -1, c: FULL }];
  let cur: Camera = FULL;
  for (let i = 0; i < z.length; i++) {
    const s = z[i];
    const c: Camera = { x: s.x, y: s.y, scale: s.scale };
    const inEnd = Math.min(s.start + RAMP_IN, (s.start + s.end) / 2);
    keys.push({ t: s.start, c: cur }, { t: inEnd, c }, { t: Math.max(inEnd, s.end), c });
    const next = z[i + 1];
    if (next && next.start - s.end < 1.4) { cur = c; continue; } // stay in and glide to the next spot
    keys.push({ t: Math.max(inEnd, s.end) + RAMP_OUT, c: FULL });
    cur = FULL;
  }
  return keys;
}

export function cameraAt(keys: Key[], t: number): Camera {
  let a = keys[0];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t < b.t) {
      const span = b.t - a.t;
      const k = span <= 0 ? 1 : ease(clamp((t - a.t) / span, 0, 1));
      // interpolate the scale in log space so the push feels even, and the centre in screen space
      const scale = Math.exp(Math.log(a.c.scale) + (Math.log(b.c.scale) - Math.log(a.c.scale)) * k);
      return { scale, x: a.c.x + (b.c.x - a.c.x) * k, y: a.c.y + (b.c.y - a.c.y) * k };
    }
    a = b;
  }
  return a.c;
}

export function newZoom(t: number, duration: number, x = 0.5, y = 0.5): Zoom {
  const start = clamp(t, 0, Math.max(0, duration - 1.5));
  return { id: uid(), start, end: Math.min(duration, start + 2.5), x, y, scale: 1.8, auto: false };
}
