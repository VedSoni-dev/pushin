"use client";
// "Write the post": a title and a short post for the clip, from one line about what it shows.
import { useEffect, useState } from "react";
import { usePublik } from "./PublikGate";
import type { Clip } from "@/lib/store";

const KEY = "pushin.anthropicKey";

export function Caption({ clip, onTitle }: { clip: Clip; onTitle: (t: string) => void }) {
  const { choice } = usePublik();
  const [about, setAbout] = useState("");
  const [ownKey, setOwnKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ title: string; post: string } | null>(null);
  const [error, setError] = useState<{ msg: string; url?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { try { setOwnKey(localStorage.getItem(KEY) ?? ""); } catch { /* private mode */ } }, []);
  const viaPublik = choice === "publik";

  const run = async () => {
    setBusy(true); setError(null); setOut(null);
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "content-type": "application/json", ...(!viaPublik && ownKey ? { "x-user-key": ownKey } : {}) },
        body: JSON.stringify({ about, seconds: clip.trim[1] - clip.trim[0], zooms: clip.zooms.length }),
      });
      const j = (await res.json().catch(() => ({}))) as { title?: string; post?: string; error?: string; topUpUrl?: string };
      if (!res.ok) setError({ msg: j.error ?? `Something went wrong (${res.status}).`, url: j.topUpUrl });
      else setOut({ title: j.title ?? "", post: j.post ?? "" });
    } catch { setError({ msg: "Couldn't reach the server. Check your connection." }); }
    finally { setBusy(false); }
  };

  return (
    <section className="border-t border-[var(--line)] pt-5">
      <div className="label mb-1">Write the post</div>
      <p className="text-xs muted mt-0 mb-2">Say what the clip shows; AI writes a title and a post to go with it.</p>
      <textarea className="field" rows={2} placeholder="e.g. adding a teammate and sharing a board in our app" value={about} onChange={(e) => setAbout(e.target.value)} />
      {!viaPublik && (
        <input className="field mt-2" type="password" placeholder="Your Anthropic API key (sk-ant-…)" value={ownKey} autoComplete="off"
          onChange={(e) => { setOwnKey(e.target.value); try { localStorage.setItem(KEY, e.target.value); } catch { /* */ } }} aria-label="Your Anthropic API key" />
      )}
      <button className="btn btn-sm mt-2 w-full" onClick={() => void run()} disabled={busy || !about.trim()}>{busy ? "Writing…" : viaPublik ? "Write it (publik plan)" : "Write it (your key)"}</button>
      {error && <p role="alert" className="text-xs mt-2" style={{ color: "var(--err)" }}>{error.msg}{error.url && <> <a href={error.url} target="_blank" rel="noopener noreferrer" className="underline">Top up on publik</a></>}</p>}
      {out && (
        <div className="mt-3 rounded-xl border border-[var(--line)] p-3 text-sm">
          {out.title && <div className="font-semibold">{out.title}</div>}
          <p className="mt-1 mb-2 whitespace-pre-wrap leading-relaxed">{out.post}</p>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(out.post); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy post"}</button>
            {out.title && <button className="btn btn-sm btn-ghost" onClick={() => onTitle(out.title)}>Use as clip name</button>}
          </div>
        </div>
      )}
    </section>
  );
}
