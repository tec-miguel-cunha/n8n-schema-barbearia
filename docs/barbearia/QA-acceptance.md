# QA — acceptance checks (spec section 10)

Use this list after deploying workflows to n8n Cloud and configuring environment variables.

| # | Component | Action | Expected |
|---|-----------|--------|----------|
| 1 | Motor IA | `POST` chat webhook with `{"mensagem":"Têm lâminas Feather em Lisboa?","telefone":"+351912345678","canal":"whatsapp"}` | JSON includes `resposta` with grounded stock/price; latency under a few seconds (DeepSeek + Airtable). |
| 2 | Detecção | `POST` with `"Onde está a encomenda E002?"` | Reply references order data from **ENCOMENDAS** (no invented tracking). |
| 3 | Memória | Send a product question, then `"E no Porto?"` with same `telefone` | Second answer uses **CONVERSAS** history; coherent follow-up. |
| 4 | WhatsApp | Real device → WhatsApp Business number | Answer in &lt; 5 s (Meta + n8n + engine). |
| 5 | Dashboard | Open Lovable; fetch metrics + conversations URLs | No console errors; data matches Airtable. |
| 6 | Voz | ElevenLabs tool → same `POST /webhook/chat` with `canal":"voz"` | Short pt-PT reply; kit iniciante price if asked (~59.90€ from **PRODUTOS**). |
| 7 | Devolução | Message like devolução flow for order **E004** with motivo keywords | Row in **DEVOLUCOES** or assistant confirms reference `#DEV…`. |
| 8 | Escalada | Message with `"urgente"` or `"falar com uma pessoa"` | **ESCALADAS** row; optional Resend email if configured; canned handoff text. |

## curl examples

```bash
CHAT=https://YOUR_INSTANCE/webhook/chat
curl -sS -X POST "$CHAT" -H "Content-Type: application/json" \
  -d '{"mensagem":"Têm lâminas Feather em Lisboa?","telefone":"+351912345678","canal":"whatsapp"}'
```

```bash
METRICS=https://YOUR_INSTANCE/webhook/metrics
curl -sS "$METRICS"
```

## Notes

- **PII:** Do not log full `telefone` in n8n execution logs in production.
- **Costs:** Each message runs intent + reply (2 DeepSeek calls) unless escalated early (intent skipped on escalation).
