/**
 * GET /webhook/conversations — last 20 CONVERSAS for dashboard feed.
 * Env: AIRTABLE_TOKEN, AIRTABLE_BASE_ID
 */
async function conversationsDashboard() {
  const http = this.helpers.httpRequest.bind(this.helpers);
  const E = (k, d = '') => ($env[k] !== undefined && $env[k] !== '' ? $env[k] : d);
  const token = E('AIRTABLE_TOKEN');
  const baseId = E('AIRTABLE_BASE_ID');
  const T_CONV = E('AIRTABLE_TBL_CONVERSAS') || 'CONVERSAS';
  const T_CLI = E('AIRTABLE_TBL_CLIENTES') || 'CLIENTES';
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  if (!token || !baseId) {
    console.error(JSON.stringify({ scope: 'barbearia.conversations', level: 'error', message: 'MISSING_ENV' }));
    return [{ json: [] }];
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

  function initials(name) {
    if (!name || !String(name).trim()) return '??';
    const p = String(name).trim().split(/\s+/);
    return (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
  }

  function relTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    const d = Date.now() - t;
    const m = Math.floor(d / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  }

  try {
    const conv = await listAll(T_CONV);
    const clientes = await listAll(T_CLI);
    const byPhone = {};
    for (const c of clientes) {
      const tel = c.fields.telefone;
      if (tel) byPhone[String(tel)] = c.fields;
    }

    const sorted = conv
      .map((r) => ({ r, u: new Date(r.fields.updated_at || 0).getTime() }))
      .sort((a, b) => b.u - a.u)
      .slice(0, 20)
      .map(({ r }) => {
        const tel = r.fields.telefone || '';
        const cli = byPhone[tel];
        const nome = cli?.nome || tel.slice(-4) || 'Cliente';
        let preview = '';
        try {
          const a = typeof r.fields.historico === 'string' ? JSON.parse(r.fields.historico) : r.fields.historico;
          if (Array.isArray(a) && a.length) {
            const last = a[a.length - 1];
            preview = last.content || '';
          }
        } catch (e) {}
        return {
          id: r.fields.id_sessao || r.id,
          name: nome,
          initials: initials(cli?.nome || nome),
          preview: String(preview).slice(0, 120),
          status: r.fields.estado || 'Pendente',
          time: relTime(r.fields.updated_at),
          canal: String(r.fields.canal || 'whatsapp').toLowerCase(),
        };
      });

    return [{ json: sorted }];
  } catch (e) {
    console.error(JSON.stringify({ scope: 'barbearia.conversations', level: 'error', message: String(e.message || e) }));
    return [{ json: [] }];
  }
}

return await conversationsDashboard.call(this);
