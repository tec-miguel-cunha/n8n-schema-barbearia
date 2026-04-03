
Here’s a practical setup order that matches what the workflows expect.

## 1. Airtable

1. Create a base (e.g. **Barbearia Demo**).
2. Add tables and fields as in [`docs/barbearia/airtable/README.md`](docs/barbearia/airtable/README.md) (PRODUTOS, ENCOMENDAS, CLIENTES, CONVERSAS, DEVOLUCOES, ESCALADAS).
3. Optional for WhatsApp dedupe: add **META_DEDUP** with `message_id`, `telefone`, `processed_at` (same doc).
4. Import seeds: [`docs/barbearia/airtable/seed/PRODUTOS.csv`](docs/barbearia/airtable/seed/PRODUTOS.csv) and [`ENCOMENDAS.csv`](docs/barbearia/airtable/seed/ENCOMENDAS.csv).
5. Create a **Personal Access Token** with read/write to that base. Note **Base ID** (`app…`).

## 2. DeepSeek

1. Create an API key in the DeepSeek console.
2. Default API base: `https://api.deepseek.com` (only set `DEEPSEEK_API_URL` if you use another compatible endpoint).

## 3. Meta WhatsApp (for the ingress workflow)

1. Meta Developer app with **WhatsApp** product, **Phone number ID**, **permanent access token**, **Business account** as in your product doc.
2. Webhook verify token: e.g. `barbearia2026` (or your own; must match env).

## 4. n8n — environment variables

In **n8n Cloud**: **Settings → Variables** (or your host’s env). Set at least:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `AIRTABLE_TOKEN` | Chat engine, WhatsApp dedupe, dashboards | PAT |
| `AIRTABLE_BASE_ID` | Same | `app…` |
| `DEEPSEEK_API_KEY` | Chat engine | Bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp ingress | Graph API path |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp ingress | `Bearer` for sends |
| `WHATSAPP_VERIFY_TOKEN` | (you configure Meta to match) | Same string as Meta webhook verify |
| `BARBEARIA_CHAT_ENGINE_URL` | WhatsApp ingress | **Production** URL of the **chat** workflow webhook |

Optional:

| Variable | Purpose |
|----------|---------|
| `DEEPSEEK_API_URL` | Override API base (default `https://api.deepseek.com`) |
| `BARBEARIA_NOME` | Name in prompts |
| `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_TO` | Escalation email via Resend |
| `LOG_WEBHOOK_URL` | POST JSON logs for errors/warnings |
| `DEDUPE_ENABLED` | `false` to turn off META_DEDUP |
| `AIRTABLE_TBL_*` | Only if your table names differ from defaults |

**Critical:** `BARBEARIA_CHAT_ENGINE_URL` must be the **full production URL** n8n shows on the **Chat Engine** workflow’s Webhook node (after you activate that workflow), e.g. `https://your-instance.app.n8n.cloud/webhook/.../chat` (exact path depends on your n8n version and path setting).

## 5. Import workflows (order)

1. Import [`barbearia-chat-engine.json`](workflows/barbearia/barbearia-chat-engine.json) → **Activate** → copy **Production webhook URL** → set `BARBEARIA_CHAT_ENGINE_URL` to that value.
2. Import [`barbearia-whatsapp-ingress.json`](workflows/barbearia/barbearia-whatsapp-ingress.json) → **Activate**.
3. Import [`barbearia-dashboard-metrics.json`](workflows/barbearia/barbearia-dashboard-metrics.json) and [`barbearia-dashboard-conversations.json`](workflows/barbearia/barbearia-dashboard-conversations.json) → **Activate**.

## 6. Meta webhook

In Meta Developer dashboard, set:

- **Callback URL** = production URL of the **WhatsApp** workflow’s Webhook (ingress).
- **Verify token** = same as `WHATSAPP_VERIFY_TOKEN`.

Subscribe to **messages** (as in your spec).

## 7. Smoke tests

- Chat engine: `POST` the production chat URL with JSON  
  `{"mensagem":"Olá","telefone":"+351900000000","canal":"whatsapp"}`  
  → JSON with `resposta`.
- WhatsApp: send a real message to the business number.
- Dashboard: `GET` metrics and conversations URLs from Lovable or browser.

## 8. Regenerating from repo

If you change [`engine/*.code.js`](workflows/barbearia/engine/) files: run `npm run barbearia:workflows`, then re-import or replace workflows in n8n.

---

**Common mistakes:** chat workflow not **active** (webhook 404); `BARBEARIA_CHAT_ENGINE_URL` still pointing at **test** URL or wrong path; Airtable field names not matching the doc; Meta token expired or wrong **Phone number ID**.

For validation of the exported JSON (structure only): [`docs/barbearia/workflow-validation.md`](docs/barbearia/workflow-validation.md) and `npm run validate:barbearia` with `npm run serve` running.