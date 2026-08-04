#!/usr/bin/env node
// Prints which local dev environment variables are set, without leaking values.
// Usage: node scripts/print-env.mjs

import { existsSync, readFileSync } from 'node:fs';

const devVarsPath = '.dev.vars';

if (!existsSync(devVarsPath)) {
  console.log(`No ${devVarsPath} found. Copy .dev.vars.example to ${devVarsPath} to configure local secrets.`);
  process.exit(0);
}

const lines = readFileSync(devVarsPath, 'utf-8').split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [key] = trimmed.split('=');
  if (key) {
    console.log(`${key}: set`);
  }
}
