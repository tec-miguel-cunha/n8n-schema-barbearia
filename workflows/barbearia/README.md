# Barbearia n8n workflows (importable)

These files implement the plan in [docs/barbearia](../../docs/barbearia) and [Projecto_Completo_Barbearia.docx.md](../../Projecto_Completo_Barbearia.docx.md).

## Regenerate JSON from source

After editing any `engine/*.code.js` file:

```bash
npm run barbearia:workflows
```

(from repo root)

## Hardening (retries, logging, dedupe)

- **Chat engine:** env preflight, exponential **retry** on Airtable/DeepSeek for transient errors, structured **console + optional `LOG_WEBHOOK_URL`**, fatal catch returns safe `resposta` + `_errorCode`.
- **WhatsApp:** **retry** on engine + Meta send; optional **Meta `message.id` dedupe** via Airtable table **META_DEDUP** (see [docs/barbearia/airtable/README.md](../../docs/barbearia/airtable/README.md)).
- **Dashboard GET:** env check, **retry** on Airtable list, JSON error fallbacks.

## Validate workflow JSON (structure + node params)

Does **not** validate Code logic — see [docs/barbearia/workflow-validation.md](../../docs/barbearia/workflow-validation.md).

```bash
npm run serve   # terminal 1
npm run validate:barbearia   # terminal 2
```

## Workflows

| File | Webhook path (production) | Method |
|------|-----------------------------|--------|
| [barbearia-chat-engine.json](./barbearia-chat-engine.json) | `/webhook/chat` (path segment `chat`) | POST |
| [barbearia-whatsapp-ingress.json](./barbearia-whatsapp-ingress.json) | `/webhook/whatsapp` | GET (verify), POST |
| [barbearia-dashboard-metrics.json](./barbearia-dashboard-metrics.json) | `/webhook/metrics` | GET |
| [barbearia-dashboard-conversations.json](./barbearia-dashboard-conversations.json) | `/webhook/conversations` | GET |

n8n Cloud shows the full URL after activation (e.g. `https://senaflow.app.n8n.cloud/webhook/...`). Align **Webhook** node paths with your instance if needed.

## Environment variables (n8n)

See [docs/barbearia/airtable/README.md](../../docs/barbearia/airtable/README.md) for Airtable and shared vars.

**Chat engine:** `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `DEEPSEEK_API_KEY`, optional `DEEPSEEK_API_URL`, `BARBEARIA_NOME`, `RESEND_*` (optional email on escalation).

**WhatsApp ingress:** `WHATSAPP_VERIFY_TOKEN` (default `barbearia2026`), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `BARBEARIA_CHAT_ENGINE_URL` (full URL to the chat engine webhook).

**Dashboard GET workflows:** same Airtable vars as above.

## Import

1. n8n → **Workflows** → **Import from file** → select each JSON.
2. Open each workflow → map **Webhook** URLs to production URLs.
3. Set **environment variables** (or credentials) on the instance.
4. **Activate** workflows.

The **Code** nodes load logic from the embedded `jsCode`; to edit logic, change `engine/*.code.js` and run `npm run barbearia:workflows`, then re-import or paste the updated code in the UI.

## Order of rollout

1. Create Airtable base + seed CSVs ([docs/barbearia/airtable](../../docs/barbearia/airtable)).
2. Import and activate **Chat Engine**; test with `POST` (see [QA checklist](../../docs/barbearia/QA-acceptance.md)).
3. Import **WhatsApp Ingress**; set `BARBEARIA_CHAT_ENGINE_URL` to the production chat URL.
4. Import **dashboard** workflows; point Lovable at the GET URLs ([docs/barbearia/lovable-integration.md](../../docs/barbearia/lovable-integration.md)).
