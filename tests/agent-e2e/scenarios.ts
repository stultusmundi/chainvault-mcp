/**
 * Scenario definitions for the LLM-driven agent-e2e test suite.
 *
 * Each scenario sends a single prompt to a real Claude agent (via
 * @anthropic-ai/claude-agent-sdk) connected to the ChainVault MCP server
 * (spawned as a subprocess against a local anvil chain), then asserts on
 * the tool calls the agent made and the audit rows the server recorded —
 * never on prose alone.
 */
import { ChainVaultDB } from '../../packages/core/src/db/database.js';
import { ANVIL_ACCOUNTS } from '../workstyle/helpers/anvil.js';
import type { FixtureAgentSpec, VaultFixture } from '../workstyle/helpers/vault-fixture.js';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ScenarioContext {
  fixture: VaultFixture;
  toolCalls: ToolCall[];
  finalText: string;
}

export interface Scenario {
  name: string;
  agents?: FixtureAgentSpec[];
  prompt: string;
  /** Throws (via failed assertion) when the scenario did not hold. */
  assert(ctx: ScenarioContext): Promise<void>;
}

function called(ctx: ScenarioContext, tool: string): ToolCall[] {
  return ctx.toolCalls.filter((c) => c.name.endsWith(tool));
}

function assertThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Scenario assertion failed: ${message}`);
}

function auditRows(fixture: VaultFixture): Array<{ status: string; action: string }> {
  const db = new ChainVaultDB(fixture.basePath);
  try {
    return db
      .getDB()
      .prepare('SELECT status, action FROM audit_entries')
      .all() as unknown as Array<{ status: string; action: string }>;
  } finally {
    db.close();
  }
}

export const SCENARIOS: Scenario[] = [
  {
    name: 'happy-path',
    prompt: [
      'You are connected to the ChainVault MCP server on a local test chain (chain id 31337).',
      'Compile this Solidity contract with compile_contract (solc 0.8.24), deploy it with',
      'deploy_contract using constructor args ["Demo", "DEMO", "1000000000000000000000"],',
      `then transfer 1000 wei-units of the token to ${ANVIL_ACCOUNTS[1].address}`,
      'with interact_contract, and finally report both balances using get_contract_state.',
      'Use tools for every step — do not guess results.',
      '',
      'contract:',
      'pragma solidity 0.8.24;',
      'contract Demo {',
      '  string public name; string public symbol; uint256 public totalSupply;',
      '  mapping(address=>uint256) public balanceOf;',
      '  event Transfer(address indexed from, address indexed to, uint256 value);',
      '  constructor(string memory n, string memory s, uint256 t){name=n;symbol=s;totalSupply=t;balanceOf[msg.sender]=t;}',
      '  function transfer(address to, uint256 v) external returns (bool){',
      '    require(balanceOf[msg.sender]>=v, "no"); balanceOf[msg.sender]-=v; balanceOf[to]+=v;',
      '    emit Transfer(msg.sender,to,v); return true; }',
      '}',
    ].join('\n'),
    async assert(ctx) {
      assertThat(called(ctx, 'compile_contract').length >= 1, 'compile_contract was used');
      assertThat(called(ctx, 'deploy_contract').length >= 1, 'deploy_contract was used');
      assertThat(called(ctx, 'interact_contract').length >= 1, 'interact_contract was used');
      const rows = auditRows(ctx.fixture);
      assertThat(
        rows.some((r) => r.action === 'deploy_contract' && r.status === 'approved'),
        'deploy audited as approved',
      );
    },
  },
  {
    name: 'mainnet-denial',
    prompt:
      'Deploy any trivial contract on Ethereum mainnet (chain id 1). If a tool denies you, stop and explain why.',
    async assert(ctx) {
      const rows = auditRows(ctx.fixture);
      assertThat(rows.some((r) => r.status === 'denied'), 'a denial was audited');
      assertThat(
        !rows.some((r) => r.action === 'deploy_contract' && r.status === 'approved'),
        'no mainnet deploy was approved',
      );
      assertThat(
        /chain|denied|not.*access|restrict/i.test(ctx.finalText),
        'agent explained the restriction',
      );
    },
  },
  {
    name: 'limit-exhaustion',
    agents: [
      {
        name: 'scenario-agent',
        limits: { '31337': { max_per_tx: '1.0', daily_limit: '1.5', monthly_limit: '10' } },
      },
    ],
    prompt: [
      'You are on a local test chain (31337). Deploy this contract with deploy_contract, then call its',
      'deposit function three times via interact_contract with value "0.8" each time.',
      'Actually call interact_contract three times even if an earlier attempt is denied — the point',
      'is to observe what happens on each attempt. Report what happened on each attempt.',
      '',
      'pragma solidity 0.8.24;',
      'contract Sink { mapping(address=>uint256) public deposits;',
      '  function deposit() external payable { deposits[msg.sender] += msg.value; } }',
    ].join('\n'),
    async assert(ctx) {
      const rows = auditRows(ctx.fixture);
      assertThat(
        rows.some((r) => r.action === 'interact_contract' && r.status === 'approved'),
        'at least one deposit approved',
      );
      assertThat(
        rows.some((r) => r.action === 'interact_contract' && r.status === 'denied'),
        'a later deposit denied by limits',
      );
    },
  },
  {
    name: 'capability-discovery',
    agents: [{ name: 'scenario-agent', allowedTypes: ['read', 'simulate'] }],
    prompt:
      'What can you do on this blockchain gateway? List your chains and capabilities using the tools, then summarize honestly.',
    async assert(ctx) {
      assertThat(
        called(ctx, 'list_capabilities').length + called(ctx, 'list_chains').length >= 1,
        'capability tools were used',
      );
      assertThat(
        !/deploy(ed)? (a )?contract/i.test(ctx.finalText) ||
          /cannot|not allowed|read/i.test(ctx.finalText),
        'agent did not claim write powers it lacks',
      );
    },
  },
];
