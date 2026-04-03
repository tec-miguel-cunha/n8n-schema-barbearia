# ElevenLabs — same chat engine as WhatsApp

No separate n8n workflow is required. The **Barbearia — Chat Engine** workflow already handles `canal: "voz"` with shorter voice-oriented rules in the system prompt ([barbearia-chat-engine.code.js](../../workflows/barbearia/engine/barbearia-chat-engine.code.js)).

## Tool configuration (ElevenLabs Conversational AI)

- **Method:** `POST`
- **URL:** your production chat webhook, e.g. `https://senaflow.app.n8n.cloud/webhook/chat`
- **Body (JSON):**

```json
{
  "mensagem": "{{user_message}}",
  "telefone": "voz_{{session_id}}",
  "canal": "voz"
}
```

Use a **stable** `telefone` per voice session (e.g. UUID from ElevenLabs) so **CONVERSAS** in Airtable stays one row per session and does not collide with real WhatsApp numbers.

## Response path

Map the tool response field to **`$.resposta`** (or the path your n8n JSON returns).

## Prompting

The **voice-specific** copy (Sofia, 2 sentences, no product IDs) is partially enforced in code; complete the agent system prompt using section 7 of [Projecto_Completo_Barbearia.docx.md](../../Projecto_Completo_Barbearia.docx.md).
