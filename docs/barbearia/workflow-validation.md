# Validating Barbearia workflow JSON (this repo’s schema API)

## What `POST /validate/workflow` actually checks

The n8n schema generator’s API ([server.ts](../../server.ts)) validates:

- **Workflow shape:** `nodes` array, `connections` object, unique node **names**, connection targets that reference existing nodes.
- **Per node:** `type`, `typeVersion`, `position`, and **parameters** against extracted `n8n-nodes-base` rules (enums, fixed collections, etc.).

## What it does **not** check

- **JavaScript inside Code nodes** (`jsCode`) — business logic, retries, and error paths are **not** statically verified.
- **Runtime behaviour** against Airtable, DeepSeek, or Meta (only manual or integration tests cover that).
- **Secrets / env** presence (you configure those in n8n).

So: **yes, run validation** after regenerating `workflows/barbearia/*.json` — it catches structural mistakes and invalid node parameters. **No**, it cannot “prove” the chat engine is correct; pair it with the [QA checklist](./QA-acceptance.md).

## How to run locally

1. Start the schema API (from repo root):

   ```bash
   npm run serve
   ```

   (Uses `PORT`, default `3000`.)

2. In another terminal:

   ```bash
   npm run validate:barbearia
   ```

   Or set `VALIDATION_URL` if the API listens elsewhere:

   ```bash
   VALIDATION_URL=http://127.0.0.1:8080 npm run validate:barbearia
   ```

The script posts each `workflows/barbearia/barbearia-*.json` to `/validate/workflow` and exits **non-zero** if any response has `valid: false`.

## CI

Add a job that runs `npm run build` (tsc) + `npm run serve` in background + `npm run validate:barbearia`, or run the validator against a long-lived internal instance.
