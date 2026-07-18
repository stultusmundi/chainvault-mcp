/**
 * Agent E2E Scenario Runner
 *
 * Drives real Claude agents (via @anthropic-ai/claude-agent-sdk) against a
 * live ChainVault MCP server (spawned as a subprocess, `chainvault serve`)
 * talking to a local anvil chain. Each scenario in scenarios.ts sends one
 * prompt and asserts on the tool calls made + audit rows recorded — never
 * on prose alone.
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var set
 *   - anvil on PATH (forge/foundry)
 *   - CLI built: npm run build (done automatically by the test:scenarios script)
 *
 * Run:
 *   npm run test:scenarios [-- <scenario-name>]
 */
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AnvilHarness, anvilAvailable } from '../workstyle/helpers/anvil.js';
import { createVaultFixture } from '../workstyle/helpers/vault-fixture.js';
import { SCENARIOS, type Scenario, type ScenarioContext, type ToolCall } from './scenarios.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, '..', '..', 'packages', 'cli', 'dist', 'index.js');

if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.log('SKIP: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN to run scenarios.');
  process.exit(0);
}
if (!anvilAvailable()) {
  console.log('SKIP: anvil not found on PATH.');
  process.exit(0);
}

async function runScenario(scenario: Scenario): Promise<number> {
  const anvil = await AnvilHarness.start();
  const fixture = await createVaultFixture({
    rpcUrl: anvil.rpcUrl,
    agents: scenario.agents ?? [{ name: 'scenario-agent' }],
  });
  const agentName = (scenario.agents ?? [{ name: 'scenario-agent' }])[0].name;

  const toolCalls: ToolCall[] = [];
  let finalText = '';

  try {
    const stream = query({
      prompt: scenario.prompt,
      options: {
        maxTurns: 20,
        allowedTools: ['mcp__chainvault__*'],
        mcpServers: {
          chainvault: {
            type: 'stdio' as const,
            command: 'node',
            args: [CLI, 'serve', '-p', fixture.basePath],
            env: { ...process.env, CHAINVAULT_VAULT_KEY: fixture.vaultKeys[agentName] },
          },
        },
        permissionMode: 'acceptEdits' as const,
      },
    });

    for await (const message of stream) {
      if (message.type === 'assistant' && 'message' in message && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            toolCalls.push({ name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
          }
          if (block.type === 'text') finalText = block.text;
        }
      }
      if (message.type === 'result' && 'result' in message) {
        finalText = String((message as { result?: string }).result ?? finalText);
      }
    }

    const ctx: ScenarioContext = { fixture, toolCalls, finalText };
    await scenario.assert(ctx);
    console.log(`PASS ${scenario.name} (${toolCalls.length} tool calls)`);
    return toolCalls.length;
  } finally {
    await fixture.cleanup();
    await anvil.stop();
  }
}

const only = process.argv[2];
const selected = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS;
if (only && selected.length === 0) {
  console.error(`Unknown scenario '${only}'. Known: ${SCENARIOS.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

let failed = 0;
for (const scenario of selected) {
  try {
    await runScenario(scenario);
  } catch (firstErr) {
    console.warn(`RETRY ${scenario.name}: ${String(firstErr)}`);
    try {
      await runScenario(scenario); // one retry — LLM nondeterminism
    } catch (secondErr) {
      console.error(`FAIL ${scenario.name}: ${String(secondErr)}`);
      failed++;
    }
  }
}
process.exit(failed === 0 ? 0 : 1);
