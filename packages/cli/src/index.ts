#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { initVault } from './commands/init.js';
import { addKey, listKeys, removeKey, generateKey, addKeyFromSeed } from './commands/key.js';
import {
  createAgent, listAgents, revokeAgent, showAgent, rotateAgentKey,
  grantChain, grantKey, grantApi, setLimit, allowTxTypes, setApiLimit,
} from './commands/agent.js';
import { addApiKey, listApiKeys, removeApiKey, addRpcEndpoint, listRpcEndpoints, removeRpcEndpoint } from './commands/api.js';
import { viewLogs } from './commands/logs.js';
import { serve } from './commands/serve.js';
import { getPassword, prompt } from './commands/prompt.js';

const DEFAULT_PATH = join(homedir(), '.chainvault');

const program = new Command();

program
  .name('chainvault')
  .description('Secure MCP server gateway between AI agents and blockchains')
  .version('0.1.0');

// --- Init ---

program
  .command('init')
  .description('Create a new master vault')
  .option('-p, --path <path>', 'Vault storage path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = await getPassword();
    if (!password) { console.error('Password is required'); process.exit(1); }
    const result = await initVault(opts.path, password);
    console.log(result);
  });

// --- Serve ---

program
  .command('serve')
  .description('Start the MCP server')
  .option('-p, --path <path>', 'Vault storage path', DEFAULT_PATH)
  .action(async (opts) => {
    await serve(opts.path);
  });

// --- Status ---

program
  .command('status')
  .description('Show vault and server status')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const { existsSync } = await import('node:fs');
    const vaultExists = existsSync(join(opts.path, 'master.vault'));
    console.log(`Vault path: ${opts.path}`);
    console.log(`Vault initialized: ${vaultExists ? 'yes' : 'no'}`);
    if (vaultExists) {
      try {
        const password = await getPassword();
        const { MasterVault } = await import('@chainvault/core');
        const vault = await MasterVault.unlock(opts.path, password);
        const keys = vault.listKeys();
        const agents = vault.getData().agents;
        console.log(`Keys: ${keys.length}`);
        console.log(`Agents: ${Object.keys(agents).length}`);
        vault.lock();
      } catch {
        console.log('Could not unlock vault for details.');
      }
    }
  });

// --- Key Management ---

const keyCmd = program.command('key').description('Manage private keys');

keyCmd
  .command('list')
  .description('List stored keys (addresses only)')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = await getPassword();
    const result = await listKeys(opts.path, password);
    console.log(result);
  });

keyCmd
  .command('add <name>')
  .description('Import a private key (prompted interactively)')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .option('-c, --chains <chains>', 'Comma-separated chain IDs', '1')
  .action(async (name, opts) => {
    const password = await getPassword();
    const privateKey = await prompt('Private key (0x...): ', true);
    if (!privateKey) { console.error('Private key is required'); process.exit(1); }
    const chains = opts.chains.split(',').map(Number);
    const result = await addKey(opts.path, password, name, privateKey, chains);
    console.log(result);
  });

keyCmd
  .command('remove <name>')
  .description('Remove a key from the vault')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, opts) => {
    const password = await getPassword();
    const result = await removeKey(opts.path, password, name);
    console.log(result);
  });

keyCmd
  .command('generate <name>')
  .description('Generate a new random keypair')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .option('-c, --chains <chains>', 'Comma-separated chain IDs', '1')
  .action(async (name, opts) => {
    const password = await getPassword();
    const chains = opts.chains.split(',').map(Number);
    const result = await generateKey(opts.path, password, name, chains);
    console.log(result);
  });

keyCmd
  .command('add-seed <name>')
  .description('Import a key from a BIP-39 seed phrase (prompted interactively)')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .option('-c, --chains <chains>', 'Comma-separated chain IDs', '1')
  .action(async (name, opts) => {
    const password = await getPassword();
    const mnemonic = await prompt('Seed phrase: ', true);
    if (!mnemonic) { console.error('Seed phrase is required'); process.exit(1); }
    const chains = opts.chains.split(',').map(Number);
    const result = await addKeyFromSeed(opts.path, password, name, mnemonic, chains);
    console.log(result);
  });

// --- Agent Management ---

const agentCmd = program.command('agent').description('Manage agent vaults');

agentCmd
  .command('list')
  .description('List all agents with permission summaries')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = await getPassword();
    const result = await listAgents(opts.path, password);
    console.log(result);
  });

agentCmd
  .command('create <name>')
  .description('Create an agent vault with initial permissions')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .option('-c, --chains <chains>', 'Comma-separated chain IDs', '')
  .option('-k, --keys <keys>', 'Comma-separated key names to grant', '')
  .option('-a, --api-keys <apiKeys>', 'Comma-separated API key names to grant', '')
  .option('-t, --tx-types <types>', 'Comma-separated tx types (deploy,write,read,simulate,transfer)', 'read,simulate')
  .action(async (name, opts) => {
    const password = await getPassword();
    const chains = opts.chains ? opts.chains.split(',').map(Number) : [];
    const grantedKeys = opts.keys ? opts.keys.split(',').filter(Boolean) : [];
    const grantedApiKeys = opts.apiKeys ? opts.apiKeys.split(',').filter(Boolean) : [];
    const txTypes = opts.txTypes.split(',').filter(Boolean);
    const config = {
      name,
      chains,
      tx_rules: { allowed_types: txTypes, limits: {} },
      api_access: {} as Record<string, any>,
      contract_rules: { mode: 'none' as const },
    };
    const result = await createAgent(opts.path, password, config, grantedKeys, grantedApiKeys);
    console.log(result);
  });

agentCmd
  .command('show <name>')
  .description('Show detailed agent configuration')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, opts) => {
    const password = await getPassword();
    const result = await showAgent(opts.path, password, name);
    console.log(result);
  });

agentCmd
  .command('revoke <name>')
  .description('Revoke agent access and delete vault')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, opts) => {
    const password = await getPassword();
    const result = await revokeAgent(opts.path, password, name);
    console.log(result);
  });

agentCmd
  .command('rotate-key <name>')
  .description('Rotate agent vault key (requires current key)')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, opts) => {
    const password = await getPassword();
    const currentKey = await prompt('Current vault key: ', true);
    if (!currentKey) { console.error('Current vault key is required'); process.exit(1); }
    const result = await rotateAgentKey(opts.path, password, name, currentKey);
    console.log(result);
  });

agentCmd
  .command('grant <name> <type> <value>')
  .description('Grant access: chain <id>, key <name>, or api <service>')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, type, value, opts) => {
    const password = await getPassword();
    let result: string;
    switch (type) {
      case 'chain':
        result = await grantChain(opts.path, password, name, parseInt(value, 10));
        break;
      case 'key':
        result = await grantKey(opts.path, password, name, value);
        break;
      case 'api':
        result = await grantApi(opts.path, password, name, value);
        break;
      default:
        console.error(`Unknown grant type '${type}'. Use: chain, key, or api`);
        process.exit(1);
    }
    console.log(result);
  });

agentCmd
  .command('set-limit <name> <chain-id> <type> <amount>')
  .description('Set spend limit: type is daily, per-tx, or monthly')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, chainId, type, amount, opts) => {
    const password = await getPassword();
    if (!['daily', 'per-tx', 'monthly'].includes(type)) {
      console.error("Limit type must be 'daily', 'per-tx', or 'monthly'");
      process.exit(1);
    }
    const result = await setLimit(opts.path, password, name, chainId, type as 'daily' | 'per-tx' | 'monthly', amount);
    console.log(result);
  });

agentCmd
  .command('allow-tx <name> <types>')
  .description('Set allowed tx types (comma-separated: deploy,write,read,simulate,transfer)')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, types, opts) => {
    const password = await getPassword();
    const result = await allowTxTypes(opts.path, password, name, types.split(','));
    console.log(result);
  });

agentCmd
  .command('set-api-limit <name> <service> <limits>')
  .description('Set API rate limits (format: per-second/daily, e.g. 5/5000)')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, service, limits, opts) => {
    const password = await getPassword();
    const [perSec, daily] = limits.split('/').map(Number);
    if (!perSec || !daily) {
      console.error('Format: <per-second>/<daily>, e.g. 5/5000');
      process.exit(1);
    }
    const result = await setApiLimit(opts.path, password, name, service, perSec, daily);
    console.log(result);
  });

// --- API Key Management ---

const apiCmd = program.command('api').description('Manage API keys and RPC endpoints');

apiCmd
  .command('add <service>')
  .description('Add an API key (prompted interactively)')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .option('-u, --url <url>', 'Base URL for the API service')
  .action(async (service, opts) => {
    const password = await getPassword();
    const key = await prompt('API key: ', true);
    if (!key) { console.error('API key is required'); process.exit(1); }
    const baseUrl = opts.url || await prompt('Base URL: ');
    if (!baseUrl) { console.error('Base URL is required'); process.exit(1); }
    const result = await addApiKey(opts.path, password, service, key, baseUrl);
    console.log(result);
  });

apiCmd
  .command('list')
  .description('List configured API services')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = await getPassword();
    const apiResult = await listApiKeys(opts.path, password);
    const rpcResult = await listRpcEndpoints(opts.path, password);
    console.log('API Keys:');
    console.log(apiResult);
    console.log('\nRPC Endpoints:');
    console.log(rpcResult);
  });

apiCmd
  .command('remove <name>')
  .description('Remove an API key')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, opts) => {
    const password = await getPassword();
    const result = await removeApiKey(opts.path, password, name);
    console.log(result);
  });

apiCmd
  .command('add-rpc <name> <url>')
  .description('Add an RPC endpoint')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .option('-c, --chain-id <chainId>', 'Chain ID', '1')
  .action(async (name, url, opts) => {
    const password = await getPassword();
    const chainId = parseInt(opts.chainId, 10);
    const result = await addRpcEndpoint(opts.path, password, name, url, chainId);
    console.log(result);
  });

apiCmd
  .command('remove-rpc <name>')
  .description('Remove an RPC endpoint')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (name, opts) => {
    const password = await getPassword();
    const result = await removeRpcEndpoint(opts.path, password, name);
    console.log(result);
  });

// --- Logs ---

program
  .command('logs [agent]')
  .description('View audit log, optionally filtered by agent')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .option('--denied', 'Show denied requests only')
  .action(async (agent, opts) => {
    const result = await viewLogs(opts.path, { agent, denied: opts.denied });
    console.log(result);
  });

// --- Solc ---

const solcCmd = program.command('solc').description('Manage Solidity compiler');
solcCmd
  .command('pull [version]')
  .description('Pull solc Docker image for contract compilation')
  .action(async (version: string | undefined) => {
    const { pullSolc } = await import('./commands/solc.js');
    try {
      const result = await pullSolc(version || '0.8.20');
      console.log(result);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });

// --- No args: launch TUI ---

if (process.argv.length <= 2) {
  const { render } = await import('ink');
  const React = await import('react');
  const { App } = await import('./tui/App.js');
  const basePath = process.env.CHAINVAULT_PATH || DEFAULT_PATH;
  render(React.createElement(App, { basePath }));
} else {
  program.parse();
}
