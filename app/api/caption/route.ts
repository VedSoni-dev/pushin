// Write a title and a short post for a clip, from the person's one-line description.
// AI goes through publik API (Connect your plan) or the person's own Anthropic key.
import { cookies } from "next/headers";
import { MODELS, publikChat, resolveProvider } from "@/lib/publik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You write copy for short screen-recorded product demos that people post on X, LinkedIn or a changelog.
Given what the clip shows, answer with JSON only: {"title": "...", "post": "..."}.
title: 2-6 words, plain, no emoji, no quotes. post: 1-3 short sentences in a plain, confident voice, under 260 characters, no hashtags, at most one emoji. Never invent features the description doesn't mention.`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { about?: string; seconds?: number; zooms?: number };
  const about = String(body.about ?? "").trim().slice(0, 800);
  if (!about) return Response.json({ error: "Say in a line what the clip shows." }, { status: 400 });
  const user = `The clip (${Math.round(Number(body.seconds) || 0)} s, ${Number(body.zooms) || 0} zoom-ins) shows: ${about}`;
  const ownKey = req.headers.get("x-user-key")?.trim();
  const p = resolveProvider(await cookies(), ownKey ? { baseURL: "https://api.anthropic.com", apiKey: ownKey } : null);
  if (p.kind === "needs_own_key") return Response.json({ error: "Add your Anthropic API key below, or switch to your publik plan in Settings." }, { status: 401 });

  let text = "";
  if (p.kind === "publik") {
    const r = await publikChat(p, { model: MODELS.fast, max_tokens: 400, temperature: 0.7, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }, req.signal);
    if (!r.ok) return Response.json({ error: r.message, ...(r.topUpUrl ? { topUpUrl: r.topUpUrl } : {}) }, { status: r.status });
    text = r.text;
  } else {
    let res: Response;
    try {
      res = await fetch(`${p.baseURL}/v1/messages`, {
        method: "POST", signal: req.signal, cache: "no-store",
        headers: { "content-type": "application/json", "x-api-key": p.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 400, system: SYSTEM, messages: [{ role: "user", content: user }] }),
      });
    } catch {
      return Response.json({ error: "Couldn't reach Anthropic. Try again." }, { status: 502 });
    }
    const j = (await res.json().catch(() => ({}))) as { content?: { text?: string }[]; error?: { message?: string } };
    if (!res.ok) return Response.json({ error: j.error?.message ?? `Anthropic answered ${res.status}.` }, { status: res.status === 401 ? 401 : 502 });
    text = (j.content ?? []).map((c) => c.text ?? "").join("");
  }
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : text) as { title?: string; post?: string };
    return Response.json({ title: String(o.title ?? "").slice(0, 80), post: String(o.post ?? "").slice(0, 400) });
  } catch {
    return Response.json({ title: "", post: text.trim().slice(0, 400) });
  }
}
