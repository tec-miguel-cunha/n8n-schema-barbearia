# Lovable.dev — integration with n8n

## Endpoints

Use the **production** webhook URLs from your n8n Cloud instance after workflows are active:

- **Metrics:** `GET` — same path as the **Barbearia — GET Metrics** workflow (e.g. `.../webhook/metrics`).
- **Conversations:** `GET` — **Barbearia — GET Conversations** (e.g. `.../webhook/conversations`).

Response shapes match [Projecto_Completo_Barbearia.docx.md](../../Projecto_Completo_Barbearia.docx.md) section 4 (metrics object and conversations array).

## Polling

The spec refreshes every **30 seconds**:

```javascript
const METRICS_URL = import.meta.env.VITE_N8N_METRICS_URL;
const CONV_URL = import.meta.env.VITE_N8N_CONVERSATIONS_URL;

async function refresh() {
  const [m, c] = await Promise.all([
    fetch(METRICS_URL).then((r) => r.json()),
    fetch(CONV_URL).then((r) => r.json()),
  ]);
  // update UI
}
setInterval(refresh, 30_000);
```

Store URLs in Lovable **environment variables** (not committed): `VITE_N8N_METRICS_URL`, `VITE_N8N_CONVERSATIONS_URL`.

## CORS

The generated **Respond to Webhook** nodes set `Access-Control-Allow-Origin: *` on the dashboard workflows. If the browser still blocks requests:

- Confirm the request is **GET** (no preflight for simple requests), or
- Add an **OPTIONS** webhook in n8n (optional), or
- Proxy through a same-origin API route in Lovable instead of calling n8n from the browser.

## Replacing hardcoded demo data

Swap the static conversation array in the Lovable project for the `fetch(CONV_URL)` result. Map fields: `id`, `name`, `initials`, `preview`, `status`, `time`, `canal` — already aligned with the [barbearia-dashboard-conversations](../../workflows/barbearia/engine/barbearia-dashboard-conversations.code.js) output.
