#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { initVault } from './commands/init.js';
import { addKey, listKeys, removeKey } from './commands/key.js';
import { listAgents, revokeAgent } from './commands/agent.js';
import { serve } from './commands/serve.js';

const DEFAULT_PATH = join(homedir(), '.chainvault');

const program = new Command();

program
  .name('chainvault')
  .description('Secure MCP server gateway between AI agents and blockchains')
  .version('0.1.0');

program
  .command('init')
  .description('Create a new master vault')
  .option('-p, --path <path>', 'Vault storage path', DEFAULT_PATH)
  .action(async (opts) => {
    // In real implementation, password is prompted interactively
    const password = process.env.CHAINVAULT_PASSWORD || '';
    if (!password) {
      console.error('Set CHAINVAULT_PASSWORD or use the TUI for interactive setup');
      process.exit(1);
    }
    const result = await initVault(opts.path, password);
    console.log(result);
  });

program
  .command('serve')
  .description('Start the MCP server')
  .option('-p, --path <path>', 'Vault storage path', DEFAULT_PATH)
  .action(async (opts) => {
    await serve(opts.path);
  });

const keyCmd = program.command('key').description('Manage keys');

keyCmd
  .command('list')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = process.env.CHAINVAULT_PASSWORD || '';
    const result = await listKeys(opts.path, password);
    console.log(result);
  });

const agentCmd = program.command('agent').description('Manage agents');

agentCmd
  .command('list')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = process.env.CHAINVAULT_PASSWORD || '';
    const result = await listAgents(opts.path, password);
    console.log(result);
  });

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

if (process.argv.length <= 2) {
  // No command args: launch TUI
  const { render } = await import('ink');
  const React = await import('react');
  const { App } = await import('./tui/App.js');
  const basePath = process.env.CHAINVAULT_PATH || DEFAULT_PATH;
  render(React.createElement(App, { basePath }));
} else {
  program.parse();
}
