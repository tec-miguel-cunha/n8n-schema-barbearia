/**
 * GET /webhook/metrics — aggregate CONVERSAS / ESCALADAS (UTC day).
 * Env: AIRTABLE_TOKEN, AIRTABLE_BASE_ID
 */
async function metricsDashboard() {
  const http = this.helpers.httpRequest.bind(this.helpers);
  const E = (k, d = '') => ($env[k] !== undefined && $env[k] !== '' ? $env[k] : d);
  const token = E('AIRTABLE_TOKEN');
  const baseId = E('AIRTABLE_BASE_ID');
  const T_CONV = E('AIRTABLE_TBL_CONVERSAS') || 'CONVERSAS';
  const T_ESC = E('AIRTABLE_TBL_ESCALADAS') || 'ESCALADAS';
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  if (!token || !baseId) {
    console.error(JSON.stringify({ scope: 'barbearia.metrics', level: 'error', message: 'MISSING_ENV' }));
    return [
      {
        json: {
          messages_today: 0,
          resolution_rate: 0,
          active_escalations: 0,
          voice_calls_today: 0,
          messages_by_hour: Array(24).fill(0),
          _errorCode: 'MISSING_ENV',
        },
      },
    ];
  }

  const retryGet = async (url) => {
    let last;
    for (let i = 0; i < 4; i++) {
      try {
        return await http({ method: 'GET', url, headers: auth, json: true, timeout: 60000 });
      } catch (e) {
        last = e;
        const c = e.statusCode || e.status || 0;
        const retryable = !c || c === 429 || c >= 500;
        if (!retryable || i === 3) throw e;
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
      }
    }
    throw last;
  };

  async function listAll(table) {
    const rows = [];
    let offset = '';
    do {
      const qs = new URLSearchParams();
      if (offset) qs.set('offset', offset);
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${qs}`;
      const res = await retryGet(url);
      rows.push(...(res.records || []));
      offset = res.offset || '';
    } while (offset);
    return rows;
  }

  try {
    const conv = await listAll(T_CONV);
    const esc = await listAll(T_ESC);

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let messages_today = 0;
    const byHour = Array(24).fill(0);
    let voice_calls_today = 0;

    for (const r of conv) {
      const u = r.fields.updated_at;
      const t = u ? new Date(u) : null;
      if (!t || t < start) continue;
      const hist = r.fields.historico;
      let n = 0;
      try {
        const a = typeof hist === 'string' ? JSON.parse(hist) : hist;
        if (Array.isArray(a)) n = a.filter((m) => m.role === 'user').length;
      } catch (e) {
        n = 1;
      }
      messages_today += n;
      const h = t.getUTCHours();
      byHour[h] = (byHour[h] || 0) + n;
    }

    for (const r of conv) {
      const u = r.fields.updated_at;
      const t = u ? new Date(u) : null;
      if (!t || t < start) continue;
      if (String(r.fields.canal || '').toLowerCase() === 'voz') voice_calls_today += 1;
    }

    const resolved = conv.filter((r) => String(r.fields.estado || '') === 'Resolvido').length;
    const total = Math.max(conv.length, 1);
    const resolution_rate = Math.round((resolved / total) * 100);

    const active_escalations = esc.filter((r) => String(r.fields.estado || '') === 'Pendente').length;

    return [
      {
        json: {
          messages_today,
          resolution_rate,
          active_escalations,
          voice_calls_today,
          messages_by_hour: byHour,
        },
      },
    ];
  } catch (e) {
    console.error(JSON.stringify({ scope: 'barbearia.metrics', level: 'error', message: String(e.message || e) }));
    return [
      {
        json: {
          messages_today: 0,
          resolution_rate: 0,
          active_escalations: 0,
          voice_calls_today: 0,
          messages_by_hour: Array(24).fill(0),
          _errorCode: 'AIRTABLE_FAILED',
        },
      },
    ];
  }
}

return await metricsDashboard.call(this);
