// A small made-up app, drawn on a canvas, for the landing page and the optional example clip.
// Things happen in two places so the auto-zoom has something to find: typing top-left, then a form bottom-right.

export const SCENE_SECONDS = 9;
const TITLE = "Ship the changelog";
const BODY = "New: export to MP4 straight from the browser.";

export function drawScene(ctx: CanvasRenderingContext2D, t: number, W: number, H: number) {
  const k = W / 1280;
  ctx.save();
  ctx.scale(k, k);
  const w = 1280, h = H / k;
  // window chrome
  ctx.fillStyle = "#fbfaf7"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#efece4"; ctx.fillRect(0, 0, w, 44);
  ["#ef6a5a", "#f2b84b", "#5dbb63"].forEach((c, i) => { ctx.fillStyle = c; dot(ctx, 22 + i * 20, 22, 6); });
  ctx.fillStyle = "#8a857a"; ctx.font = "500 15px system-ui, sans-serif"; ctx.fillText("notes · draft", 600, 27);
  // sidebar
  ctx.fillStyle = "#f3f1ea"; ctx.fillRect(0, 44, 240, h - 44);
  ["Inbox", "Drafts", "Launches", "Archive"].forEach((s, i) => {
    if (i === 1) { ctx.fillStyle = "#e4e0d4"; rr(ctx, 12, 64 + i * 40, 216, 32, 8); ctx.fill(); }
    ctx.fillStyle = "#4a463e"; ctx.font = "500 16px system-ui, sans-serif"; ctx.fillText(s, 28, 86 + i * 40);
  });
  // phase 1 (0.8s–4s): typing a title and a line
  const typed = Math.max(0, Math.min(TITLE.length + BODY.length, Math.floor((t - 0.8) * 22)));
  const ti = TITLE.slice(0, Math.min(typed, TITLE.length));
  const bo = BODY.slice(0, Math.max(0, typed - TITLE.length));
  ctx.fillStyle = "#1c1a16"; ctx.font = "700 34px system-ui, sans-serif"; ctx.fillText(ti || "Untitled", 290, 120);
  ctx.fillStyle = "#4a463e"; ctx.font = "400 20px system-ui, sans-serif"; ctx.fillText(bo, 290, 166);
  const blink = Math.floor(t * 2.4) % 2 === 0 && t < 4.6;
  if (blink) {
    ctx.fillStyle = "#e2572b";
    const cx = typed <= TITLE.length ? 290 + ctx.measureText("").width + measure(ctx, ti, "700 34px system-ui, sans-serif") : 290 + measure(ctx, bo, "400 20px system-ui, sans-serif");
    ctx.fillRect(cx + 3, typed <= TITLE.length ? 92 : 148, 2.5, typed <= TITLE.length ? 36 : 24);
  }
  // quiet placeholder lines
  ctx.fillStyle = "#e8e4da";
  for (let i = 0; i < 5; i++) { rr(ctx, 290, 210 + i * 34, 720 - i * 70, 14, 7); ctx.fill(); }
  // phase 2 (5.2s–7.6s): a publish form fills in bottom-right
  const bx = 820, by = h - 230;
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#e1ddd2"; ctx.lineWidth = 1.5;
  rr(ctx, bx, by, 420, 190, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#1c1a16"; ctx.font = "600 18px system-ui, sans-serif"; ctx.fillText("Publish", bx + 22, by + 38);
  const p2 = Math.max(0, Math.min(1, (t - 5.2) / 1.4));
  ctx.fillStyle = "#f3f1ea"; rr(ctx, bx + 22, by + 58, 376, 40, 8); ctx.fill();
  ctx.fillStyle = "#4a463e"; ctx.font = "400 16px system-ui, sans-serif";
  ctx.fillText("changelog/2026-11".slice(0, Math.floor(p2 * 17)), bx + 36, by + 84);
  const pressed = t > 6.9 && t < 7.25, done = t >= 7.25;
  ctx.fillStyle = done ? "#2f9e5a" : pressed ? "#b8431f" : "#e2572b";
  rr(ctx, bx + 22, by + 116, 376, 46, 10); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillText(done ? "Published ✓" : "Publish now", bx + 160 + (done ? -2 : 0), by + 145);
  ctx.restore();
}

function measure(ctx: CanvasRenderingContext2D, s: string, font: string) { const f = ctx.font; ctx.font = font; const m = ctx.measureText(s).width; ctx.font = f; return m; }
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** The zooms the analysis finds on this scene, for the landing page's live demo (no analysis needed there). */
export const SCENE_ZOOMS = [
  { id: "a", start: 0.6, end: 4.2, x: 0.36, y: 0.17, scale: 2.0, auto: true },
  { id: "b", start: 5.0, end: 7.9, x: 0.81, y: 0.77, scale: 2.0, auto: true },
];
