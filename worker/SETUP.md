# Turning on AI replies for Talk It Out

The chat page is public, so it can't hold a secret key. A tiny Cloudflare Worker (free) holds the key and passes messages to Claude. About 10 minutes.

## 1. Get an Anthropic API key
1. Go to https://console.anthropic.com and sign up.
2. **Billing**: add a little credit (for example $5).
3. **Limits**: set a monthly spend limit (for example $5) so it can never cost more than you expect.
4. **API Keys** → **Create Key**, name it `talk-it-out`, and copy it. Don't send it to anyone, including in chat.

## 2. Create the Worker
1. Go to https://dash.cloudflare.com and sign up (free plan).
2. **Workers & Pages** → **Create** → **Create Worker**. Name it `talk-it-out` → **Deploy**.
3. **Edit code**. Delete what's there, paste everything from `worker.js` (this folder), then **Deploy**.

## 3. Add the key to the Worker
1. Open the Worker → **Settings** → **Variables and Secrets** → **Add**.
2. Type: **Secret**, name: `ANTHROPIC_API_KEY`, value: the key from step 1 → **Deploy**.

## 4. Send Claude the Worker's address
It looks like `https://talk-it-out.<your-name>.workers.dev`. That address isn't secret. Once it's in `CFG.aiUrl` in `index.html`, the page switches to AI replies.

If the Worker ever stops working (no credit, outage), the page falls back to its pre-written replies on its own.
