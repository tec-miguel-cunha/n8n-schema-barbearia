/**
 * Barbearia chat engine — production-hardened (retries, logging, env checks, safe failures).
 * Webhook body: { mensagem, telefone, canal }
 *
 * Env: AIRTABLE_TOKEN, AIRTABLE_BASE_ID, DEEPSEEK_API_KEY
 * Optional: DEEPSEEK_API_URL, BARBEARIA_NOME, RESEND_*, AIRTABLE_TBL_*, LOG_WEBHOOK_URL (POST JSON lines)
 */
async function barbeariaEngine() {
  const E = (k, d = '') => ($env[k] !== undefined && $env[k] !== '' ? $env[k] : d);

  const redactPhone = (t) => {
    const s = String(t || '');
    if (s.length <= 4) return '****';
    return `***${s.slice(-4)}`;
  };

  const log = (scope, level, message, err) => {
    const line = {
      ts: new Date().toISOString(),
      scope: `barbearia.engine.${scope}`,
      level,
      message,
      err: err ? String(err.message || err) : undefined,
    };
    try {
      if (level === 'error' || level === 'warn') console.error(JSON.stringify(line));
      else console.log(JSON.stringify(line));
    } catch (e) {}
    const hook = E('LOG_WEBHOOK_URL');
    if (hook && (level === 'error' || level === 'warn')) {
      this.helpers
        .httpRequest({
          method: 'POST',
          url: hook,
          headers: { 'Content-Type': 'application/json' },
          body: line,
          json: true,
          timeout: 5000,
        })
        .catch(() => {});
    }
  };

  const retryHttp = async (label, fn, opts = { max: 4, baseMs: 350 }) => {
    let last;
    for (let i = 0; i < opts.max; i++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        const status = e.statusCode || e.response?.statusCode || e.status;
        const code = typeof status === 'number' ? status : 0;
        const retryable = !code || code === 408 || code === 429 || code >= 500;
        log(label, 'warn', `http attempt ${i + 1}/${opts.max} failed`, e);
        if (!retryable || i === opts.max - 1) throw e;
        const delay = opts.baseMs * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw last;
  };

  const http = this.helpers.httpRequest.bind(this.helpers);

  const token = E('AIRTABLE_TOKEN');
  const baseId = E('AIRTABLE_BASE_ID');
  const deepseekKey = E('DEEPSEEK_API_KEY');
  const deepseekBase = (E('DEEPSEEK_API_URL') || 'https://api.deepseek.com').replace(/\/$/, '');
  const nomeBarbearia = E('BARBEARIA_NOME') || 'Barbearia';

  const missing = [];
  if (!token) missing.push('AIRTABLE_TOKEN');
  if (!baseId) missing.push('AIRTABLE_BASE_ID');
  if (!deepseekKey) missing.push('DEEPSEEK_API_KEY');
  if (missing.length) {
    log('env', 'error', `Missing env: ${missing.join(', ')}`);
    return [
      {
        json: {
          resposta: 'Serviço mal configurado. Contacte a equipa técnica.',
          mensagem: '',
          _errorCode: 'MISSING_ENV',
        },
      },
    ];
  }

  const T = {
    PRODUTOS: E('AIRTABLE_TBL_PRODUTOS') || 'PRODUTOS',
    ENCOMENDAS: E('AIRTABLE_TBL_ENCOMENDAS') || 'ENCOMENDAS',
    CLIENTES: E('AIRTABLE_TBL_CLIENTES') || 'CLIENTES',
    CONVERSAS: E('AIRTABLE_TBL_CONVERSAS') || 'CONVERSAS',
    DEVOLUCOES: E('AIRTABLE_TBL_DEVOLUCOES') || 'DEVOLUCOES',
    ESCALADAS: E('AIRTABLE_TBL_ESCALADAS') || 'ESCALADAS',
  };

  const items = $input.all();
  const raw = items[0].json;
  const body = raw.body || raw;
  const mensagem = String(body.mensagem || body.message || '').trim();
  const telefone = String(body.telefone || body.phone || '').trim();
  const canal = String(body.canal || 'whatsapp').toLowerCase();
  const phoneTag = redactPhone(telefone);

  if (!mensagem) {
    return [{ json: { resposta: 'Não recebi mensagem.', mensagem: '' } }];
  }
  if (!telefone) {
    return [{ json: { resposta: 'Falta o identificador da conversa (telefone).', mensagem } }];
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  async function airtableList(table, filterFormula) {
    const rows = [];
    let offset = '';
    do {
      const qs = new URLSearchParams();
      if (filterFormula) qs.set('filterByFormula', filterFormula);
      if (offset) qs.set('offset', offset);
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${qs}`;
      const res = await retryHttp(`airtable.list.${table}`, () =>
        http({ method: 'GET', url, headers: authHeaders, json: true }),
      );
      rows.push(...(res.records || []));
      offset = res.offset || '';
    } while (offset);
    return rows;
  }

  async function airtableCreate(table, fields) {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
    return retryHttp(`airtable.create.${table}`, () =>
      http({
        method: 'POST',
        url,
        headers: authHeaders,
        body: { fields },
        json: true,
      }),
    );
  }

  async function airtableUpdate(table, recordId, fields) {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`;
    return retryHttp(`airtable.update.${table}`, () =>
      http({
        method: 'PATCH',
        url,
        headers: authHeaders,
        body: { fields },
        json: true,
      }),
    );
  }

  async function deepSeek(messages, max_tokens = 500) {
    return retryHttp('deepseek.chat', () =>
      http({
        method: 'POST',
        url: `${deepseekBase}/v1/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: {
          model: 'deepseek-chat',
          messages,
          temperature: 0.3,
          max_tokens,
        },
        json: true,
      }),
    );
  }

  function parseHistorico(raw) {
    if (!raw) return [];
    try {
      const a = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(a) ? a : [];
    } catch (e) {
      log('historico', 'warn', 'parse failed', e);
      return [];
    }
  }

  function pushHistorico(hist, role, content) {
    const next = [...hist, { role, content, timestamp: new Date().toISOString() }];
    return next.slice(-10);
  }

  const escapeFormula = (s) => {
    const x = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${x}'`;
  };

  try {
    const convFilter = `{telefone}=${escapeFormula(telefone)}`;
    const convRows = await airtableList(T.CONVERSAS, convFilter);
    let convRecord = convRows[0];
    let historico = convRecord ? parseHistorico(convRecord.fields.historico) : [];

    const cliRows = await airtableList(T.CLIENTES, `{telefone}=${escapeFormula(telefone)}`);
    let clienteNome = '';
    if (cliRows[0]) clienteNome = cliRows[0].fields.nome || '';

    const exchangeCount = historico.filter((m) => m.role === 'user').length;
    const escalKeywords =
      /reclamação|urgente|inaceitável|absurdo|advogado|enganado|falar com pessoa|falar com humano|reclamacao/i;
    const volMatch = mensagem.match(/(\d+)\s*(unidades|un\.?|pcs)/i);
    const bulkDiscount = volMatch && parseInt(volMatch[1], 10) >= 3;

    let escalated = false;
    let escalReason = '';
    if (escalKeywords.test(mensagem)) {
      escalated = true;
      escalReason = 'palavra-chave de escalada';
    } else if (bulkDiscount) {
      escalated = true;
      escalReason = 'pedido de volume (3+ unidades)';
    } else if (exchangeCount >= 4 && convRecord && String(convRecord.fields.estado || '') !== 'Resolvido') {
      escalated = true;
      escalReason = 'mais de 4 trocas sem resolução';
    }

    let intent = 'OUTRO';
    if (!escalated) {
      const intentPrompt = `Classifica a seguinte mensagem numa das categorias abaixo. Responde APENAS com a palavra da categoria, sem pontuação, sem explicação.
PRODUTO    — perguntas sobre produtos, preços, stock, características, comparações
ENCOMENDA  — estado de encomenda, tracking, prazo de entrega
DEVOLUCAO  — devoluções, trocas, reembolsos, produto com defeito
OUTRO      — tudo o resto: saudações, reclamações, perguntas fora do âmbito

Mensagem: ${mensagem}`;
      try {
        const ir = await deepSeek([{ role: 'user', content: intentPrompt }], 15);
        const t = (ir.choices?.[0]?.message?.content || 'OUTRO').trim().toUpperCase();
        if (t.includes('PRODUTO')) intent = 'PRODUTO';
        else if (t.includes('ENCOMENDA')) intent = 'ENCOMENDA';
        else if (t.includes('DEVOLUC')) intent = 'DEVOLUCAO';
        else intent = 'OUTRO';
      } catch (e) {
        log('intent', 'warn', `intent fallback OUTRO for ${phoneTag}`, e);
        intent = 'OUTRO';
      }
    }

    let prodRecords;
    try {
      prodRecords = await airtableList(T.PRODUTOS, '');
    } catch (e) {
      log('catalog', 'error', 'failed to load PRODUTOS', e);
      return [
        {
          json: {
            resposta: 'Não consegui aceder ao catálogo de momento. Tenta novamente em breve.',
            mensagem,
            _errorCode: 'AIRTABLE_CATALOG',
          },
        },
      ];
    }

    const catalogText = prodRecords
      .map((r) => {
        const f = r.fields;
        return `${f.id} | ${f.nome} | ${f.categoria} | ${f.preco}€ | LX:${f.stock_lisboa} PT:${f.stock_porto} ALF:${f.stock_alferia}`;
      })
      .join('\n');

    if (escalated) {
      const escId = `ESC${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const summary = historico.map((h) => `${h.role}: ${h.content}`).join('\n');
      try {
        await airtableCreate(T.ESCALADAS, {
          id: `#${escId}`,
          cliente_nome: clienteNome || telefone.slice(-4),
          telefone,
          motivo_trigger: escalReason,
          resumo_conversa: `${summary}\nuser: ${mensagem}`,
          estado: 'Pendente',
          data: new Date().toISOString(),
        });
      } catch (e) {
        log('escalada', 'error', 'failed to create ESCALADAS', e);
      }

      const resposta = `Compreendo a situação. A nossa equipa foi notificada e entrará em contacto em breve. Referência: #${escId}.`;
      historico = pushHistorico(historico, 'user', mensagem);
      historico = pushHistorico(historico, 'assistant', resposta);

      try {
        if (convRecord) {
          await airtableUpdate(T.CONVERSAS, convRecord.id, {
            historico: JSON.stringify(historico),
            updated_at: new Date().toISOString(),
            estado: 'Escalado',
            intencao: intent,
            canal: canal === 'voz' ? 'Voz' : 'WhatsApp',
          });
        } else {
          await airtableCreate(T.CONVERSAS, {
            id_sessao: `S${Date.now().toString().slice(-8)}`,
            telefone,
            canal: canal === 'voz' ? 'Voz' : 'WhatsApp',
            historico: JSON.stringify(historico),
            updated_at: new Date().toISOString(),
            estado: 'Escalado',
            intencao: intent,
          });
        }
      } catch (e) {
        log('conversas', 'error', 'failed to persist escalation conversas', e);
      }

      const resend = E('RESEND_API_KEY');
      if (resend) {
        try {
          await http({
            method: 'POST',
            url: 'https://api.resend.com/emails',
            headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
            body: {
              from: E('RESEND_FROM') || 'Barbearia <onboarding@resend.dev>',
              to: [E('RESEND_TO') || 'equipa@example.com'],
              subject: `Escalada WhatsApp — ${clienteNome || 'Cliente'} — ${escalReason}`,
              text: `Referência: #${escId}\nCliente: ${clienteNome || '-'}\nTelefone: [redacted]\nTrigger: ${escalReason}\n\n${summary}`,
            },
            json: true,
            timeout: 15000,
          });
        } catch (e) {
          log('resend', 'warn', 'escalation email failed', e);
        }
      }

      return [{ json: { resposta, mensagem } }];
    }

    let branchContext = '';
    if (intent === 'ENCOMENDA') {
      let ordRows;
      try {
        ordRows = await airtableList(T.ENCOMENDAS, '');
      } catch (e) {
        log('encomendas', 'warn', 'list ENCOMENDAS failed', e);
        ordRows = [];
      }
      const phoneMatch = ordRows.filter((r) => String(r.fields.cliente_tel || '') === telefone);
      const idMatch = mensagem.match(/\bE\d{3,}\b/i);
      let relevant = phoneMatch;
      if (idMatch) {
        const id = idMatch[0].toUpperCase();
        relevant = ordRows.filter((r) => String(r.fields.id || '').toUpperCase() === id);
      }
      branchContext = relevant
        .map(
          (r) =>
            `${r.fields.id}: ${r.fields.produto_nome} | ${r.fields.estado} | tracking: ${r.fields.tracking || '—'} | ETA: ${r.fields.eta || '—'} | ${r.fields.transportadora || '—'}`,
        )
        .join('\n');
      if (!branchContext) branchContext = 'Nenhuma encomenda encontrada para este contacto.';
    } else if (intent === 'DEVOLUCAO') {
      branchContext =
        'Fluxo devolução: pede número de encomenda (ex: E007) e motivo se ainda não estiver claro. Motivos Airtable: Produto com defeito, Arrependimento, Produto errado, Outro.';
    }

    const lastFive = historico.slice(-5);
    const histText = lastFive.map((h) => `${h.role}: ${h.content}`).join('\n');

    const voiceRules =
      canal === 'voz'
        ? 'REGRAS VOZ: no máximo 2 frases curtas; nunca digas IDs tipo P006 — usa nomes de produto; termina com uma pergunta.'
        : 'Máximo 3 frases por resposta (exceto comparações de produtos).';

    const system = `És o assistente virtual da ${nomeBarbearia}. Respondes EXCLUSIVAMENTE sobre: produtos do catálogo, estado de encomendas, devoluções e informações da loja.
REGRAS: 1) Nunca inventes dados fora do catálogo e encomendas fornecidos. 2) Se faltar informação: "Não tenho essa informação. Posso ajudar com outra questão?"
3) Português de Portugal (pt-PT) apenas. 4) ${voiceRules}
5) Tom profissional e próximo. 6) Usa o nome do cliente se existir: ${clienteNome || '(desconhecido)'}.
INTENÇÃO: ${intent}
CATÁLOGO:
${catalogText}
${branchContext ? `\nCONTEXTO ESPECÍFICO:\n${branchContext}\n` : ''}
HISTÓRICO (últimas mensagens):
${histText || '(vazio)'}`;

    const userMsg = mensagem;
    let resposta = '';
    try {
      const cr = await deepSeek(
        [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        500,
      );
      resposta = (cr.choices?.[0]?.message?.content || '').trim();
    } catch (e) {
      log('deepseek.reply', 'error', 'main reply failed', e);
      resposta = 'Lamento, o serviço de IA está indisponível de momento. Tenta novamente em instantes.';
    }
    if (!resposta) resposta = 'Não tenho essa informação. Posso ajudar com outra questão?';

    if (intent === 'DEVOLUCAO') {
      const oid = mensagem.match(/\bE\d{3,}\b/i);
      const motivoMap = [
        ['defeito', 'Produto com defeito'],
        ['arrepend', 'Arrependimento'],
        ['errado', 'Produto errado'],
        ['outro', 'Outro'],
      ];
      let motivo = '';
      const low = mensagem.toLowerCase();
      for (const [k, v] of motivoMap) {
        if (low.includes(k)) {
          motivo = v;
          break;
        }
      }
      if (oid && motivo) {
        const devId = `DEV${Date.now().toString(36).toUpperCase().slice(-6)}`;
        try {
          await airtableCreate(T.DEVOLUCOES, {
            id: `#${devId}`,
            cliente_nome: clienteNome || 'Cliente',
            telefone,
            id_encomenda: oid[0].toUpperCase(),
            motivo,
            estado: 'Aberto',
            data_criacao: new Date().toISOString(),
          });
          resposta = `Pedido de devolução registado com referência #${devId}. A nossa equipa entrará em contacto nas próximas 24 horas. Sem custos adicionais para si.`;
        } catch (e) {
          log('devolucoes', 'error', 'create DEVOLUCOES failed', e);
        }
      }
    }

    historico = pushHistorico(historico, 'user', mensagem);
    historico = pushHistorico(historico, 'assistant', resposta);

    const canalField = canal === 'voz' ? 'Voz' : canal === 'dashboard' ? 'Dashboard' : 'WhatsApp';

    try {
      if (convRecord) {
        await airtableUpdate(T.CONVERSAS, convRecord.id, {
          historico: JSON.stringify(historico),
          updated_at: new Date().toISOString(),
          intencao: intent,
          canal: canalField,
        });
      } else {
        await airtableCreate(T.CONVERSAS, {
          id_sessao: `S${Date.now().toString().slice(-8)}`,
          telefone,
          canal: canalField,
          historico: JSON.stringify(historico),
          updated_at: new Date().toISOString(),
          estado: 'Pendente',
          intencao: intent,
        });
      }
    } catch (e) {
      log('conversas', 'error', 'failed to save CONVERSAS', e);
    }

    if (!cliRows[0]) {
      try {
        await airtableCreate(T.CLIENTES, {
          id: `C${Date.now().toString(36).toUpperCase().slice(-5)}`,
          telefone,
          nome: '',
          data_registo: new Date().toISOString().slice(0, 10),
        });
      } catch (e) {
        log('clientes', 'warn', 'create CLIENTES skipped', e);
      }
    }

    return [{ json: { resposta, mensagem } }];
  } catch (fatal) {
    log('fatal', 'error', `unhandled error tel=${phoneTag}`, fatal);
    return [
      {
        json: {
          resposta: 'Ocorreu um erro interno. A equipa foi notificada nos registos. Tenta de novo dentro de momentos.',
          mensagem,
          _errorCode: 'ENGINE_UNHANDLED',
        },
      },
    ];
  }
}

return await barbeariaEngine.call(this);
