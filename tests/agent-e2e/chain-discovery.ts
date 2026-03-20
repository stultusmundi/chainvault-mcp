/**
 * Agent E2E Test: Chain Discovery via ChainVault MCP
 *
 * Uses the Claude Agent SDK to ask Claude to discover available testnet
 * chains and faucets through the ChainVault MCP server's
 * list_supported_chains and request_faucet tools.
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var set
 *   - CLI built: npm run build
 *
 * Run:
 *   npx tsx tests/agent-e2e/chain-discovery.ts
 */

import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';

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
// Configure Claude SDK with ChainVault MCP server
// ---------------------------------------------------------------------------

const prompt =
  'What testnet chains are available? Which have faucets? Use the list_supported_chains tool to find out.';

let listChainsToolUsed = false;
let faucetToolUsed = false;
let resultText = '';

console.log('--- chain-discovery e2e test ---');
console.log('Sending prompt to Claude with ChainVault MCP server...\n');

try {
  const conversation = query({
    prompt,
    options: {
      maxTurns: 3,
      allowedTools: [
        'mcp__chainvault__list_supported_chains',
        'mcp__chainvault__request_faucet',
      ],
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
        if (block.type === 'tool_use') {
          if (block.name === 'mcp__chainvault__list_supported_chains') {
            listChainsToolUsed = true;
            console.log('  [tool_use] list_supported_chains called with input:', JSON.stringify(block.input));
          }
          if (block.name === 'mcp__chainvault__request_faucet') {
            faucetToolUsed = true;
            console.log('  [tool_use] request_faucet called with input:', JSON.stringify(block.input));
          }
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
console.log('list_supported_chains tool used:', listChainsToolUsed);
console.log('request_faucet tool used:', faucetToolUsed);

if (listChainsToolUsed) {
  console.log('\nPASS: Claude used the list_supported_chains MCP tool.');
} else {
  console.log('\nFAIL: Claude did NOT use the list_supported_chains MCP tool.');
  console.log('Response text (truncated):', resultText.slice(0, 500));
  process.exit(1);
}
