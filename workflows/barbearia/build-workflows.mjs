#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const root = path.dirname(new URL(import.meta.url).href.replace('file://', ''));
const uid = () => crypto.randomUUID();

function wfChatEngine() {
  const code = fs.readFileSync(path.join(root, 'engine/barbearia-chat-engine.code.js'), 'utf8');
  const wHook = uid();
  const wCode = uid();
  const wResp = uid();
  return {
    name: 'Barbearia — Chat Engine',
    meta: { templateCredsSetupCompleted: false },
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        parameters: {
          path: 'chat',
          httpMethod: 'POST',
          responseMode: 'responseNode',
          options: {},
        },
        id: wHook,
        name: 'Webhook_Chat',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2.1,
        position: [0, 300],
        webhookId: 'barbearia-chat',
      },
      {
        parameters: {
          mode: 'runOnceForAllItems',
          language: 'javaScript',
          jsCode: code,
        },
        id: wCode,
        name: 'Code_Engine',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [280, 300],
      },
      {
        parameters: {
          respondWith: 'firstIncomingItem',
          options: {
            responseHeaders: {
              entries: [
                { name: 'Access-Control-Allow-Origin', value: '*' },
                { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
                { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
              ],
            },
          },
        },
        id: wResp,
        name: 'Respond_Chat',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [560, 300],
      },
    ],
    connections: {
      Webhook_Chat: { main: [[{ node: 'Code_Engine', type: 'main', index: 0 }]] },
      Code_Engine: { main: [[{ node: 'Respond_Chat', type: 'main', index: 0 }]] },
    },
  };
}

function wfWhatsApp() {
  const code = fs.readFileSync(path.join(root, 'engine/barbearia-whatsapp-ingress.code.js'), 'utf8');
  const wWa = uid();
  const wCode = uid();
  const sw = uid();
  const rVerify = uid();
  const rNoop = uid();
  const rDone = uid();
  const r403 = uid();

  return {
    name: 'Barbearia — WhatsApp Ingress',
    meta: { templateCredsSetupCompleted: false },
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        parameters: {
          path: 'whatsapp',
          multipleMethods: true,
          httpMethod: ['GET', 'POST'],
          responseMode: 'responseNode',
          options: {},
        },
        id: wWa,
        name: 'Webhook_WhatsApp',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2.1,
        position: [0, 300],
        webhookId: 'barbearia-whatsapp',
      },
      {
        parameters: {
          mode: 'runOnceForAllItems',
          language: 'javaScript',
          jsCode: code,
        },
        id: wCode,
        name: 'Code_WhatsApp',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [280, 300],
      },
      {
        parameters: {
          mode: 'rules',
          rules: {
            values: [
              {
                conditions: {
                  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                  conditions: [
                    {
                      id: 'v1',
                      leftValue: '={{ $json.__wa }}',
                      rightValue: 'verify',
                      operator: { type: 'string', operation: 'equals', singleValue: true },
                    },
                  ],
                  combinator: 'and',
                },
                renameOutput: true,
                outputKey: 'verify',
              },
              {
                conditions: {
                  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                  conditions: [
                    {
                      id: 'v2',
                      leftValue: '={{ $json.__wa }}',
                      rightValue: 'noop',
                      operator: { type: 'string', operation: 'equals', singleValue: true },
                    },
                  ],
                  combinator: 'and',
                },
                renameOutput: true,
                outputKey: 'noop',
              },
              {
                conditions: {
                  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                  conditions: [
                    {
                      id: 'v3',
                      leftValue: '={{ $json.__wa }}',
                      rightValue: 'forbidden',
                      operator: { type: 'string', operation: 'equals', singleValue: true },
                    },
                  ],
                  combinator: 'and',
                },
                renameOutput: true,
                outputKey: 'forbidden',
              },
            ],
          },
          options: { fallbackOutput: 'extra' },
        },
        id: sw,
        name: 'Switch_WhatsApp',
        type: 'n8n-nodes-base.switch',
        typeVersion: 3.2,
        position: [520, 300],
      },
      {
        parameters: {
          respondWith: 'text',
          responseBody: '={{ $json.challenge }}',
          options: { responseCode: 200 },
        },
        id: rVerify,
        name: 'Respond_Verify',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [820, 120],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify({ received: true }) }}',
          options: { responseCode: 200 },
        },
        id: rNoop,
        name: 'Respond_Noop',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [820, 260],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify({ ok: true, resposta: $json.resposta }) }}',
          options: { responseCode: 200 },
        },
        id: rDone,
        name: 'Respond_Done',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [820, 420],
      },
      {
        parameters: {
          respondWith: 'text',
          responseBody: 'Forbidden',
          options: { responseCode: 403 },
        },
        id: r403,
        name: 'Respond_Forbidden',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [820, 560],
      },
    ],
    connections: {
      Webhook_WhatsApp: { main: [[{ node: 'Code_WhatsApp', type: 'main', index: 0 }]] },
      Code_WhatsApp: { main: [[{ node: 'Switch_WhatsApp', type: 'main', index: 0 }]] },
      Switch_WhatsApp: {
        main: [
          [{ node: 'Respond_Verify', type: 'main', index: 0 }],
          [{ node: 'Respond_Noop', type: 'main', index: 0 }],
          [{ node: 'Respond_Forbidden', type: 'main', index: 0 }],
          [{ node: 'Respond_Done', type: 'main', index: 0 }],
        ],
      },
    },
  };
}

function wfDashboard(name, pathSeg, codeFile) {
  const code = fs.readFileSync(path.join(root, 'engine', codeFile), 'utf8');
  const w = uid();
  const c = uid();
  const r = uid();
  return {
    name,
    meta: { templateCredsSetupCompleted: false },
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        parameters: {
          path: pathSeg,
          httpMethod: 'GET',
          responseMode: 'responseNode',
          options: {},
        },
        id: w,
        name: 'Webhook_GET',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2.1,
        position: [0, 300],
        webhookId: pathSeg.replace(/\//g, '-'),
      },
      {
        parameters: {
          mode: 'runOnceForAllItems',
          language: 'javaScript',
          jsCode: code,
        },
        id: c,
        name: 'Code_Dashboard',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [280, 300],
      },
      {
        parameters: {
          respondWith: 'firstIncomingItem',
          options: {
            responseHeaders: {
              entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }],
            },
          },
        },
        id: r,
        name: 'Respond_JSON',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [560, 300],
      },
    ],
    connections: {
      Webhook_GET: { main: [[{ node: 'Code_Dashboard', type: 'main', index: 0 }]] },
      Code_Dashboard: { main: [[{ node: 'Respond_JSON', type: 'main', index: 0 }]] },
    },
  };
}

fs.writeFileSync(path.join(root, 'barbearia-chat-engine.json'), JSON.stringify(wfChatEngine(), null, 2));
fs.writeFileSync(path.join(root, 'barbearia-whatsapp-ingress.json'), JSON.stringify(wfWhatsApp(), null, 2));
fs.writeFileSync(
  path.join(root, 'barbearia-dashboard-metrics.json'),
  JSON.stringify(wfDashboard('Barbearia — GET Metrics', 'metrics', 'barbearia-dashboard-metrics.code.js'), null, 2),
);
fs.writeFileSync(
  path.join(root, 'barbearia-dashboard-conversations.json'),
  JSON.stringify(
    wfDashboard('Barbearia — GET Conversations', 'conversations', 'barbearia-dashboard-conversations.code.js'),
    null,
    2,
  ),
);

console.log('Wrote: barbearia-chat-engine.json, barbearia-whatsapp-ingress.json, barbearia-dashboard-metrics.json, barbearia-dashboard-conversations.json');
