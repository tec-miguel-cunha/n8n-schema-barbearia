# Airtable — Base « Barbearia Demo »

This folder defines the data model for the Barbearia IA project. Create a base in Airtable (or import CSVs from `seed/`) and attach the **Personal Access Token** to the n8n **Airtable** credential.

**Canonical spec:** [Projecto_Completo_Barbearia.docx.md](../../Projecto_Completo_Barbearia.docx.md) section 3.

## CONVERSAS — `id_sessao` and `telefone` rules

- **`telefone`** is the **primary correlation key** for WhatsApp and for the chat engine: one logical thread per number (or per synthetic voice id).
- **`id_sessao`** is a **stable display id** for the dashboard and APIs (e.g. `S001`, `S002`). Assign it when the first **CONVERSAS** row is created for that `telefone` (monotonic counter per base or use `RECORD_ID()`-derived short id in n8n).
- **Rule:** At most **one** CONVERSAS row per `telefone` in MVP. The n8n engine **upserts** that row: update `historico`, `updated_at`, `estado`, `intencao`, `canal` on each message.
- **Voice (ElevenLabs):** Use `telefone` values like `voz_<uuid>` so they do not collide with real MSISDNs.

## Optional field (recommended for devolução flow)

The spec describes a 3-step devolução dialogue. If you need explicit state beyond parsing `historico`, add optional **Long text** field `devolucao_estado` with values such as `idle | aguarda_encomenda | aguarda_motivo | concluido`. The bundled engine infers step from `historico` only; you can extend it to use this field.

## Tables and fields

### PRODUTOS

| Field (Airtable name) | Type |
|----------------------|------|
| id | Single line text |
| nome | Single line text |
| categoria | Single line text |
| descricao | Long text |
| preco | Number |
| stock_lisboa | Number |
| stock_porto | Number |
| stock_alferia | Number |
| tags | Single line text |
| referencia | Single line text |

### ENCOMENDAS

| Field | Type |
|-------|------|
| id | Single line text |
| cliente_nome | Single line text |
| cliente_tel | Single line text |
| produto_id | Single line text |
| produto_nome | Single line text |
| estado | Single select: Entregue, Em trânsito, Processando, Atrasada, Cancelada, Devolvida |
| tracking | Single line text |
| data_envio | Date |
| transportadora | Single line text |
| eta | Date |
| loja_origem | Single line text |
| valor | Number |

### CLIENTES

| Field | Type |
|-------|------|
| id | Single line text |
| nome | Single line text |
| telefone | Single line text |
| email | Email |
| ultima_compra | Date |
| produtos_favoritos | Single line text |
| total_gasto | Number |
| notas | Long text |
| data_registo | Date |

### CONVERSAS

| Field | Type |
|-------|------|
| id_sessao | Single line text |
| telefone | Single line text |
| canal | Single select: WhatsApp, Voz, Dashboard |
| historico | Long text (JSON array) |
| updated_at | Date with time |
| estado | Single select: Resolvido, Pendente, Escalado |
| intencao | Single line text |

### DEVOLUCOES

| Field | Type |
|-------|------|
| id | Single line text |
| cliente_nome | Single line text |
| telefone | Single line text |
| id_encomenda | Single line text |
| motivo | Single select: Produto com defeito, Arrependimento, Produto errado, Outro |
| estado | Single select: Aberto, Em análise, Aprovado, Concluído, Recusado |
| data_criacao | Date with time |
| notas_equipa | Long text |

### ESCALADAS

| Field | Type |
|-------|------|
| id | Single line text |
| cliente_nome | Single line text |
| telefone | Single line text |
| motivo_trigger | Long text |
| resumo_conversa | Long text |
| estado | Single select: Pendente, Em curso, Resolvido |
| data | Date with time |
| assignado_a | Single line text |

### META_DEDUP (optional — WhatsApp idempotency)

Used by the **WhatsApp ingress** workflow to avoid processing the same Meta `message.id` twice (retries / duplicate webhooks).

| Field | Type |
|-------|------|
| message_id | Single line text (primary; Meta `wamid.*`) |
| telefone | Single line text |
| processed_at | Date with time |

Set env `DEDUPE_ENABLED=false` to disable this table. Override table name with `AIRTABLE_TBL_META_DEDUP` (default `META_DEDUP`).

## Environment variables (n8n)

Set in n8n **Settings → Variables** (or instance env):

| Variable | Purpose |
|----------|---------|
| `AIRTABLE_TOKEN` | PAT with `data.records:read` and `data.records:write` for the base |
| `AIRTABLE_BASE_ID` | Base id (e.g. `appXXXXXXXX`) |
| `DEEPSEEK_API_KEY` | API key for DeepSeek Chat API |
| `DEEPSEEK_API_URL` | Optional; default `https://api.deepseek.com` |
| `RESEND_API_KEY` | Optional; if set, escalation sends email via [Resend](https://resend.com) HTTP API |
| `RESEND_FROM` | Optional; e.g. `Barbearia <onboarding@yourdomain>` |
| `RESEND_TO` | Optional; team inbox for escalations |
| `BARBEARIA_NOME` | Display name in prompts (default: Barbearia) |
| `LOG_WEBHOOK_URL` | Optional; POST JSON log lines for engine errors/warnings (redact secrets in receiver) |
| `DEDUPE_ENABLED` | `true` / `false` — Meta message dedupe via **META_DEDUP** (default `true` when Airtable is set) |
| `AIRTABLE_TBL_META_DEDUP` | Table name for dedupe (default `META_DEDUP`) |

Gmail via native n8n **Gmail** node is supported in the workflow docs if you prefer OAuth instead of Resend.

## Importing seed data

1. Create empty tables with the fields above (exact field names help the bundled workflows).
2. In Airtable: **Add records → CSV file** for `PRODUTOS` and `ENCOMENDAS` using `seed/PRODUTOS.csv` and `seed/ENCOMENDAS.csv`.
3. Map columns if Airtable normalizes names (keep API names aligned with this doc).
