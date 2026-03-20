/**
 * Agent E2E Test: Compile HelloToken via ChainVault MCP
 *
 * Uses the Claude Agent SDK to ask Claude to compile the HelloToken.sol
 * contract through the ChainVault MCP server's compile_contract tool.
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var set
 *   - CLI built: npm run build
 *
 * Run:
 *   npx tsx tests/agent-e2e/compile-token.ts
 */

import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Prerequisite checks
// ---------------------------------------------------------------------------

const hasApiKey = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN,
);

if (!hasApiKey) {
  console.log(
    'SKIP: Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN to run this test.',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Read the Solidity source
// ---------------------------------------------------------------------------

const solPath = resolve(__dirname, 'HelloToken.sol');
const solSource = readFileSync(solPath, 'utf-8');

// ---------------------------------------------------------------------------
// Configure Claude SDK with ChainVault MCP server
// ---------------------------------------------------------------------------

const prompt = [
  'I have a Solidity contract source below. Please compile it using the compile_contract tool.',
  'Use compiler version "0.8.20" and contract name "HelloToken".',
  '',
  '```solidity',
  solSource,
  '```',
].join('\n');

let compileToolUsed = false;
let resultText = '';

console.log('--- compile-token e2e test ---');
console.log('Sending prompt to Claude with ChainVault MCP server...\n');

try {
  const conversation = query({
    prompt,
    options: {
      maxTurns: 3,
      allowedTools: ['mcp__chainvault__compile_contract'],
      mcpServers: {
        chainvault: {
          type: 'stdio' as const,
          command: 'node',
          args: ['./packages/cli/dist/index.js', 'serve'],
        },
      },
      permissionMode: 'acceptEdits' as const,
    },
  });

  for await (const message of conversation) {
    // Assistant messages have message.content with tool_use and text blocks
    if (message.type === 'assistant' && 'message' in message && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'tool_use' && block.name === 'mcp__chainvault__compile_contract') {
          compileToolUsed = true;
          console.log('  [tool_use] compile_contract called with input:', JSON.stringify(block.input));
        }
        if (block.type === 'text') {
          resultText += block.text;
        }
      }
    }

    // Result messages have a top-level `result` string, not message.content
    if (message.type === 'result' && 'result' in message) {
      resultText += (message as any).result ?? '';
    }
  }
} catch (err) {
  console.error('ERROR:', err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Report results
// ---------------------------------------------------------------------------

console.log('\n--- Results ---');
console.log('compile_contract tool used:', compileToolUsed);

if (compileToolUsed) {
  console.log('\nPASS: Claude used the compile_contract MCP tool.');
} else {
  console.log('\nFAIL: Claude did NOT use the compile_contract MCP tool.');
  console.log('Response text (truncated):', resultText.slice(0, 500));
  process.exit(1);
}
