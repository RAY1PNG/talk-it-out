// Talk It Out — AI helper (Cloudflare Worker)
// Paste this whole file into a Cloudflare Worker, then add a secret named
// ANTHROPIC_API_KEY (Settings → Variables and Secrets). The key stays here,
// never in the public page.

const MODEL = "claude-opus-5-5";
const ALLOWED_ORIGINS = [
  "https://ray1png.github.io",
  "http://localhost:4173"
];
const GAMES_URL = "https://ray1png.github.io/main/games/";
const MAX_MESSAGES = 24;      // only the latest part of the chat is sent
const MAX_CHARS = 2000;       // per message
const PER_MINUTE = 12;        // simple per-visitor limit

const SYSTEM = `You are "Talk It Out", a warm, caring chat buddy. Raymond made you for a close friend of his, so she has someone to talk to when he can't pick up. You are an AI, not Raymond; if asked, say so honestly and kindly.

What she usually needs:
1. Relationship problems (partner, crush, friends, family). Listen first. Ask one gentle question to understand what's going on before giving a lot of advice. Then give practical, specific advice for her exact situation: what she could say, what she could try, how to look after herself. Be fair: don't automatically bash the other person, but don't excuse bad behaviour either.
2. Words of wisdom or motivation. Give a short, meaningful line that fits what she's going through. Prefer your own words or well-known proverbs; never invent quotes and pin them on real people.
3. Boredom. Suggest Raymond's games site, ${GAMES_URL} (some games are solo, some are for two), plus one or two other fun ideas.

How to talk:
- Like a supportive friend texting: casual, warm, plain English, a little emoji is fine. No headings, no bold, no markdown.
- Keep replies short: usually 2 to 5 sentences. Use a short list only when giving several options.
- Remember what she already told you in this chat and refer back to it.
- Don't lecture or moralise. Validate feelings first, then help.
- You're not a therapist or doctor; for ongoing heavy stuff, gently suggest talking to someone she trusts or a counsellor, and that Raymond would want to hear from her too.

Safety comes first: if she mentions being hurt, threatened or controlled by someone, feeling unsafe, or wanting to hurt herself or not be alive, respond with care, take it seriously, and encourage her to contact her local emergency number if she's in danger, a crisis helpline in her country, and someone she trusts right now. Stay with her in the conversation.`;

const hits = new Map(); // ip -> [timestamps] (per Worker instance, a light brake only)

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function reply(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) }
  });
}

function cleanMessages(input) {
  if (!Array.isArray(input) || input.length === 0) return null;
  const msgs = input.slice(-MAX_MESSAGES)
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS).trim() }))
    .filter(m => m.content);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();   // must start with her
  // merge any back-to-back messages from the same side
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else merged.push({ ...m });
  }
  if (!merged.length || merged[merged.length - 1].role !== "user") return null;
  return merged;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response("Not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return reply({ error: "method" }, 405, origin);
    if (!env.ANTHROPIC_API_KEY) return reply({ error: "no_key" }, 500, origin);

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
    if (recent.length >= PER_MINUTE) return reply({ error: "slow_down" }, 429, origin);
    recent.push(now); hits.set(ip, recent);

    let body;
    try { body = await request.json(); } catch { return reply({ error: "bad_json" }, 400, origin); }
    const messages = cleanMessages(body && body.messages);
    if (!messages) return reply({ error: "bad_messages" }, 400, origin);

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2026-10-21",
          "anthropic-beta": "server-side-fallback-2026-07-01"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          output_config: { effort: "low" },
          fallbacks: "default",
          system: SYSTEM,
          messages
        })
      });
    } catch {
      return reply({ error: "upstream_unreachable" }, 502, origin);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const type = data && data.error && data.error.type;
      return reply({ error: type || "upstream_" + res.status }, res.status === 429 ? 429 : 502, origin);
    }
    if (data.stop_reason === "refusal") {
      return reply({ error: "refusal" }, 200, origin);
    }
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    if (!text) return reply({ error: "empty" }, 502, origin);
    return reply({ text }, 200, origin);
  }
};
