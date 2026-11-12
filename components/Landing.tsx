// The public front door at /: what pushin is, the renderer running live, what works, and the way in.
// No sign-in here; the recorder at /app opens with Sign in with publik.
import { Mark } from "./Mark";
import { LiveDemo } from "./LiveDemo";
import { PublikPitch } from "./PublikGate";

const REPO = "https://github.com/VedSoni-dev/pushin";

const STEPS: [string, string][] = [
  ["Record, or drop a video in", "Share a screen, a window or a tab right from the browser, with your mic if you want. Or drop in an MP4, WebM or MOV you already made."],
  ["It finds the action", "pushin compares every frame with the last one and finds the small spots that change: typing, a menu opening, a button turning green. Each one becomes a zoom on the timeline."],
  ["The camera pushes in", "An eased push-in, a steady hold, a glide to the next spot or a push back out. The centre never wobbles. Drag a zoom, resize it, change how close, or add your own."],
  ["Frame it and export", "Gradients, a solid colour, your own image or a blur of the video. Padding, corners, shadow, 16:9, 4:3, 1:1 or 9:16. Export makes an MP4 (WebM in Firefox) on your machine."],
];

const WORKS = [
  "Record a screen, window or tab in the browser, with optional mic",
  "Import an existing MP4, WebM or MOV",
  "Auto-zoom from on-screen activity, with eased push-in, hold and push-out",
  "Edit zooms on a timeline: move, resize, change scale, re-centre, add, delete",
  "Backgrounds: 8 gradients, solid colour, your image, blurred video",
  "Padding, corner radius, shadow, 16:9 / 4:3 / 1:1 / 9:16, trim",
  "Export to MP4 (WebM fallback) at 1080p, nothing uploaded",
  "Your clips kept in this browser between visits",
  "Write a title and post for a clip with AI (publik plan or your own key)",
];

const NOT_YET = [
  "Cursor smoothing, a custom cursor or click ripples: a web page can't read your system cursor or clicks, so zoom follows what changes on screen",
  "Webcam bubble, captions, motion blur, GIF export",
  "Faster-than-real-time export (it plays the clip once while it records)",
  "Recording on phones (their browsers can't share the screen; importing a video works)",
];

export function Landing() {
  return (
    <div className="landing">
      <header className="mx-auto max-w-[1200px] px-4 sm:px-8 h-16 flex items-center justify-between">
        <a className="brand" href="/"><Mark /> pushin</a>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a className="btn btn-ghost btn-sm hidden sm:inline-flex" href="#how">How it works</a>
          <a className="btn btn-ghost btn-sm" href={REPO}>GitHub</a>
          <a className="btn btn-primary btn-sm" href="/app">Open pushin</a>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-8 pt-8 sm:pt-14 pb-16 min-h-[calc(100svh-64px)] flex flex-col justify-center">
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-14 items-center">
          <div className="rise">
            <p className="mono text-xs tracking-wide m-0" style={{ color: "var(--accent)" }}>FREE · OPEN SOURCE · IN YOUR BROWSER</p>
            <h1 className="mt-4 mb-0 text-[38px] sm:text-[52px] leading-[1.02] tracking-[-0.045em] font-semibold">
              Screen recordings that zoom in on the action by themselves.
            </h1>
            <p className="mt-5 mb-0 text-[17px] leading-relaxed muted max-w-[480px]">
              Record a tab or your whole screen, or drop in a video. pushin pushes the camera in where things happen, frames it on a background, and exports an MP4. Windows, Mac, Linux, Chromebook. Nothing to install, and your video never leaves your computer.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a className="btn btn-accent btn-lg" href="/app">Open the recorder →</a>
              <a className="btn btn-lg" href={REPO}>Read the code</a>
            </div>
          </div>
          <div className="rise" style={{ animationDelay: ".12s" }}>
            <LiveDemo />
          </div>
        </div>
      </section>

      {/* how */}
      <section id="how" className="border-t border-[var(--line)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-20 sm:py-28">
          <h2 className="m-0 text-[32px] sm:text-[44px] tracking-[-0.035em] leading-[1.05] font-semibold max-w-[720px]">From a flat recording to a demo people watch, in about a minute.</h2>
          <ol className="mt-12 grid gap-px sm:grid-cols-2 lg:grid-cols-4 list-none p-0 m-0 rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--line)]">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="bg-[var(--card)] p-6">
                <div className="mono text-xs" style={{ color: "var(--accent)" }}>0{i + 1}</div>
                <h3 className="mt-3 mb-2 text-[18px] tracking-[-0.02em] font-semibold">{t}</h3>
                <p className="m-0 text-[14.5px] leading-relaxed muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* honest */}
      <section className="border-t border-[var(--line)] bg-[var(--bg-2)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-20 sm:py-28 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-12">
          <div>
            <h2 className="m-0 text-[32px] sm:text-[40px] tracking-[-0.035em] leading-[1.05] font-semibold">What works today</h2>
            <ul className="mt-8 p-0 list-none grid gap-3">
              {WORKS.map((w) => (
                <li key={w} className="flex gap-3 text-[15px] leading-snug"><span style={{ color: "var(--accent)" }} aria-hidden>●</span>{w}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="m-0 text-[32px] sm:text-[40px] tracking-[-0.035em] leading-[1.05] font-semibold">Not yet, and why</h2>
            <p className="mt-4 mb-0 text-[15px] leading-relaxed muted max-w-[520px]">
              A browser can&apos;t see your mouse outside its own tab or log your clicks, so pushin zooms on what changes on screen, not on where you clicked. Typing, menus and buttons show up well; a big scroll or a page load doesn&apos;t zoom on purpose.
            </p>
            <ul className="mt-6 p-0 list-none grid gap-3">
              {NOT_YET.map((w) => (
                <li key={w} className="flex gap-3 text-[15px] leading-snug muted"><span aria-hidden>○</span>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* publik */}
      <section className="border-t border-[var(--line)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-20 sm:py-28 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="m-0 text-[32px] sm:text-[44px] tracking-[-0.035em] leading-[1.05] font-semibold">Free, and it stays free.</h2>
            <p className="mt-4 mb-0 text-[16px] leading-relaxed muted max-w-[520px]">
              No subscription, no watermark, no account to try the landing page. The recorder opens with Sign in with publik; the code is MIT on GitHub, so you can also run it yourself.
            </p>
            <a className="btn btn-accent btn-lg mt-7" href="/app">Open the recorder →</a>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-[15px]">
            <PublikPitch appName="pushin" className="landing-pitch" />
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-8 flex flex-wrap gap-x-6 gap-y-2 justify-between text-sm muted">
          <span>free &amp; open source · not affiliated with Screen Studio</span>
          <span>Built by <a href="https://x.com/forkthis_ai">@forkthis_ai</a> · <a href={REPO}>GitHub</a> · MIT</span>
        </div>
      </footer>
    </div>
  );
}
