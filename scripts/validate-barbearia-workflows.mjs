#!/usr/bin/env node
/**
 * POST each Barbearia workflow JSON to the n8n schema validation API.
 * Requires: npm run serve (or VALIDATION_URL pointing at a running server).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dir = path.join(root, 'workflows', 'barbearia');
const baseUrl = (process.env.VALIDATION_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const url = `${baseUrl}/validate/workflow`;

const files = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('barbearia-') && f.endsWith('.json'))
  .sort();

async function main() {
  let failed = false;
  for (const f of files) {
    const full = path.join(dir, f);
    const workflow = JSON.parse(fs.readFileSync(full, 'utf8'));
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });
    const body = await res.json().catch(() => ({}));
    const ok = body.valid === true && res.ok;
    if (!ok) {
      failed = true;
      console.error(`FAIL ${f} HTTP ${res.status}`);
      console.error(JSON.stringify(body, null, 2));
    } else {
      const warnCount = (body.warnings || []).length;
      console.log(`OK ${f}${warnCount ? ` (${warnCount} warnings)` : ''}`);
      if (warnCount && process.env.VERBOSE === '1') {
        console.error(body.warnings);
      }
    }
  }
  if (failed) {
    console.error('\nFix workflow JSON or node parameters. See docs/barbearia/workflow-validation.md');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  if (String(e.message || e).includes('fetch')) {
    console.error('\nStart the API first: npm run serve');
    console.error('Or set VALIDATION_URL to a running instance.');
  }
  process.exit(1);
});
