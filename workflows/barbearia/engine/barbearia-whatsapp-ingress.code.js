/**
 * WhatsApp ingress — Meta verify, optional Meta message-id dedupe (Airtable), chat engine + Graph send.
 *
 * Env: WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, BARBEARIA_CHAT_ENGINE_URL
 * Dedupe (optional): AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TBL_META_DEDUP (default META_DEDUP), DEDUPE_ENABLED=true
 */
async function whatsappIngress() {
  const E = (k, d = '') => ($env[k] !== undefined && $env[k] !== '' ? $env[k] : d);
  const http = this.helpers.httpRequest.bind(this.helpers);

  const log = (level, msg, err) => {
    const line = { ts: new Date().toISOString(), scope: 'barbearia.whatsapp', level, message: msg, err: err ? String(err.message || err) : undefined };
    try {
      if (level === 'error' || level === 'warn') console.error(JSON.stringify(line));
      else console.log(JSON.stringify(line));
    } catch (e) {}
  };

  const retryHttp = async (label, fn, opts = { max: 4, baseMs: 400 }) => {
    let last;
    for (let i = 0; i < opts.max; i++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        const status = e.statusCode || e.response?.statusCode || e.status;
        const code = typeof status === 'number' ? status : 0;
        const retryable = !code || code === 408 || code === 429 || code >= 500;
        log('warn', `${label} attempt ${i + 1} failed`, e);
        if (!retryable || i === opts.max - 1) throw e;
        await new Promise((r) => setTimeout(r, opts.baseMs * Math.pow(2, i)));
      }
    }
    throw last;
  };

  const items = $input.all();
  const root = items[0].json;
  const q = root.query || {};
  const body = root.body && Object.keys(root.body).length ? root.body : root;

  const verifyTok = E('WHATSAPP_VERIFY_TOKEN') || 'barbearia2026';
  const engineUrl = E('BARBEARIA_CHAT_ENGINE_URL') || 'https://senaflow.app.n8n.cloud/webhook/chat';
  const phoneId = E('WHATSAPP_PHONE_NUMBER_ID');
  const waToken = E('WHATSAPP_ACCESS_TOKEN');
  const atToken = E('AIRTABLE_TOKEN');
  const baseId = E('AIRTABLE_BASE_ID');
  const dedupTable = E('AIRTABLE_TBL_META_DEDUP') || 'META_DEDUP';
  const dedupeOn = String(E('DEDUPE_ENABLED') || 'true').toLowerCase() !== 'false' && atToken && baseId;

  if (String(q['hub.mode'] || '') === 'subscribe') {
    if (String(q['hub.verify_token'] || '') === verifyTok) {
      return [{ json: { __wa: 'verify', challenge: String(q['hub.challenge'] || '') } }];
    }
    return [{ json: { __wa: 'forbidden' } }];
  }

  const entry = (body.entry && body.entry[0]) || (root.entry && root.entry[0]);
  const change = entry && entry.changes && entry.changes[0];
  const value = change && change.value;
  const msg = value && value.messages && value.messages[0];

  if (!msg) {
    return [{ json: { __wa: 'noop' } }];
  }

  if (msg.type !== 'text' || !msg.text || !msg.text.body) {
    return [{ json: { __wa: 'noop' } }];
  }

  const messageId = String(msg.id || '');
  const mensagem = String(msg.text.body).trim();
  let telefone = String(msg.from || '').trim();
  if (telefone && !telefone.startsWith('+')) {
    telefone = '+' + telefone.replace(/^\+/, '');
  }

  const authHeaders = {
    Authorization: `Bearer ${atToken}`,
    'Content-Type': 'application/json',
  };

  const escapeFormula = (s) => {
    const x = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${x}'`;
  };

  if (dedupeOn && messageId) {
    try {
      const qs = new URLSearchParams();
      qs.set('filterByFormula', `{message_id}=${escapeFormula(messageId)}`);
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(dedupTable)}?${qs}`;
      const res = await retryHttp('dedup.lookup', () => http({ method: 'GET', url, headers: authHeaders, json: true }));
      if ((res.records || []).length > 0) {
        log('info', `duplicate message_id skipped len=${messageId.length}`);
        return [{ json: { __wa: 'noop', _reason: 'duplicate_wamid' } }];
      }
    } catch (e) {
      log('warn', 'dedup lookup failed; continuing without dedupe', e);
    }
  }

  let resposta = '';
  try {
    const chatRes = await retryHttp('engine', () =>
      http({
        method: 'POST',
        url: engineUrl,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem, telefone, canal: 'whatsapp' }),
        json: true,
        timeout: 55000,
      }),
    );
    const raw = chatRes.body !== undefined ? chatRes.body : chatRes;
    resposta = raw.resposta || raw.body?.resposta || '';
  } catch (e) {
    log('error', 'chat engine call failed', e);
    resposta = 'Lamento, não consegui processar a mensagem de momento.';
  }

  if (phoneId && waToken && resposta) {
    const to = telefone.replace(/^\+/, '');
    try {
      await retryHttp('meta.send', () =>
        http({
          method: 'POST',
          url: `https://graph.facebook.com/v21.0/${phoneId}/messages`,
          headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: resposta.slice(0, 4096) },
          }),
          json: true,
          timeout: 30000,
        }),
      );
    } catch (e) {
      log('error', 'Meta send failed', e);
    }
  }

  if (dedupeOn && messageId && resposta) {
    try {
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(dedupTable)}`;
      await retryHttp('dedup.insert', () =>
        http({
          method: 'POST',
          url,
          headers: authHeaders,
          body: {
            fields: {
              message_id: messageId,
              telefone,
              processed_at: new Date().toISOString(),
            },
          },
          json: true,
        }),
      );
    } catch (e) {
      log('warn', 'dedup insert failed (may duplicate on retry)', e);
    }
  }

  return [{ json: { __wa: 'done', resposta } }];
}

return await whatsappIngress.call(this);
