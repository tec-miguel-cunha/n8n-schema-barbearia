# Barbearia IA — implementation docs

This folder supports the **Barbearia n8n rollout** plan (shared chat engine, WhatsApp ingress, dashboard GET APIs).

| Doc | Purpose |
|-----|---------|
| [airtable/README.md](./airtable/README.md) | Table schemas, CONVERSAS rules, env vars, CSV seeds |
| [lovable-integration.md](./lovable-integration.md) | Lovable fetch URLs, polling, CORS |
| [elevenlabs.md](./elevenlabs.md) | Voice tool → same `/webhook/chat` |
| [QA-acceptance.md](./QA-acceptance.md) | Manual test matrix from the product spec |
| [workflow-validation.md](./workflow-validation.md) | Using `POST /validate/workflow` on exported JSON (limits + script) |

**Workflow JSON + engine source:** [workflows/barbearia](../../workflows/barbearia/README.md)

**Product specification:** [Projecto_Completo_Barbearia.docx.md](../../Projecto_Completo_Barbearia.docx.md)
