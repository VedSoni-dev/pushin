// Draw one frame: background, the recording framed with padding, rounded corners and a shadow,
// and the camera pushing in on the whole scene.
import type { Camera } from "./zoom";

export type Aspect = "16:9" | "1:1" | "9:16" | "4:3";
export type Look = {
  bg: string; // a gradient id, "solid", "image" or "blur"
  solid: string;
  padding: number; // 0..0.2 of the shorter side
  radius: number; // px at 1080p
  shadow: number; // 0..1
  aspect: Aspect;
};

export const DEFAULT_LOOK: Look = { bg: "dusk", solid: "#1d2b24", padding: 0.08, radius: 18, shadow: 0.6, aspect: "16:9" };

// Our own gradients: [angle in degrees, stops]
export const GRADIENTS: Record<string, { name: string; angle: number; stops: string[] }> = {
  dusk: { name: "Dusk", angle: 135, stops: ["#ff8a5b", "#e2497a", "#5b3fa8"] },
  meadow: { name: "Meadow", angle: 160, stops: ["#d9f99d", "#34d399", "#0f766e"] },
  harbor: { name: "Harbor", angle: 120, stops: ["#a5f3fc", "#3b82f6", "#1e3a8a"] },
  clay: { name: "Clay", angle: 145, stops: ["#fde4cf", "#f2a07b", "#b4532a"] },
  ink: { name: "Ink", angle: 150, stops: ["#3a3f4a", "#17191e", "#0a0b0d"] },
  paper: { name: "Paper", angle: 180, stops: ["#f6f4ee", "#e7e2d6"] },
  citrus: { name: "Citrus", angle: 125, stops: ["#fff3b0", "#ffb547", "#ff6a3d"] },
  lagoon: { name: "Lagoon", angle: 135, stops: ["#c4b5fd", "#67e8f9", "#22c55e"] },
};

export function outputSize(aspect: Aspect, long = 1920): { w: number; h: number } {
  const short = Math.round((long * 9) / 16);
  switch (aspect) {
    case "1:1": return { w: short, h: short };
    case "9:16": return { w: short, h: long };
    case "4:3": return { w: Math.round((short * 4) / 3), h: short };
    default: return { w: long, h: short };
  }
}

export function cssGradient(id: string): string {
  const g = GRADIENTS[id];
  if (!g) return "#222";
  return `linear-gradient(${g.angle}deg, ${g.stops.join(", ")})`;
}

function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number, look: Look, src: CanvasImageSource | null, image: HTMLImageElement | null) {
  if (look.bg === "solid") { ctx.fillStyle = look.solid; ctx.fillRect(0, 0, W, H); return; }
  if (look.bg === "image" && image && image.naturalWidth) { cover(ctx, image, image.naturalWidth, image.naturalHeight, W, H); return; }
  if (look.bg === "blur" && src) {
    ctx.save();
    ctx.filter = "blur(40px) saturate(1.3) brightness(0.8)";
    const s = src as HTMLVideoElement;
    cover(ctx, src, s.videoWidth || (src as HTMLCanvasElement).width, s.videoHeight || (src as HTMLCanvasElement).height, W, H, 1.15);
    ctx.restore();
    return;
  }
  const g = GRADIENTS[look.bg] ?? GRADIENTS.dusk;
  const a = (g.angle * Math.PI) / 180;
  const r = Math.abs(W * Math.sin(a)) / 2 + Math.abs(H * Math.cos(a)) / 2;
  const dx = Math.sin(a) * r, dy = -Math.cos(a) * r;
  const lg = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
  g.stops.forEach((c, i) => lg.addColorStop(i / (g.stops.length - 1), c));
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
}

function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, W: number, H: number, extra = 1) {
  if (!iw || !ih) return;
  const s = Math.max(W / iw, H / ih) * extra;
  const w = iw * s, h = ih * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

/** Where the recording sits inside the frame. */
export function frameRect(W: number, H: number, vw: number, vh: number, look: Look) {
  const pad = Math.round(Math.min(W, H) * look.padding);
  const aw = W - pad * 2, ah = H - pad * 2;
  const s = Math.min(aw / vw, ah / vh);
  const w = vw * s, h = vh * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  vw: number,
  vh: number,
  look: Look,
  cam: Camera,
  image: HTMLImageElement | null = null,
) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const k = Math.min(W, H) / 1080;
  const r = frameRect(W, H, vw || 16, vh || 9, look);
  // camera: a viewport of W/scale × H/scale around the focus point, kept inside the frame
  const s = Math.max(1, cam.scale);
  const vpw = W / s, vph = H / s;
  let cx = r.x + cam.x * r.w, cy = r.y + cam.y * r.h;
  cx = Math.min(W - vpw / 2, Math.max(vpw / 2, cx));
  cy = Math.min(H - vph / 2, Math.max(vph / 2, cy));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(s, 0, 0, s, -(cx - vpw / 2) * s, -(cy - vph / 2) * s);
  paintBackground(ctx, W, H, look, src, image);
  const rad = Math.min(look.radius * k, r.w / 2, r.h / 2);
  if (look.shadow > 0 && look.padding > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.55 * look.shadow})`;
    ctx.shadowBlur = 60 * k * look.shadow;
    ctx.shadowOffsetY = 18 * k * look.shadow;
    ctx.fillStyle = "#000";
    roundRect(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, look.padding > 0 ? rad : 0);
  ctx.clip();
  ctx.drawImage(src, r.x, r.y, r.w, r.h);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
