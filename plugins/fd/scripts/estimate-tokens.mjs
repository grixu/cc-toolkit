#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

export function countChars(text) {
  return [...text].length;
}

export function estimateTokens(text, charsPerToken = 4) {
  const d = Number(charsPerToken);
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error(`chars-per-token must be a positive number, got: ${charsPerToken}`);
  }
  const chars = countChars(text);
  return { chars, tokens: Math.ceil(chars / d) };
}

export function runEstimate(filePath, charsPerToken = 4) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`file not found: ${resolved}`);
  }
  return estimateTokens(fs.readFileSync(resolved, 'utf8'), charsPerToken);
}

function parseCliArgs(argv) {
  const args = { file: null, charsPerToken: 4 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--chars-per-token') {
      args.charsPerToken = argv[++i];
    } else if (!args.file) {
      args.file = argv[i];
    }
  }
  return args;
}

function main() {
  const { file, charsPerToken } = parseCliArgs(process.argv.slice(2));
  if (!file) {
    process.stdout.write(JSON.stringify({ error: 'usage: estimate-tokens.mjs <file> [--chars-per-token <d>]' }) + '\n');
    process.exit(1);
  }
  try {
    process.stdout.write(JSON.stringify(runEstimate(file, charsPerToken)) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

// Detect direct invocation without node:url (outside the allowed builtin set).
function isMain() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === decodeURIComponent(new URL(import.meta.url).pathname);
}

if (isMain()) main();
