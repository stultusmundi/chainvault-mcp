import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { MasterVault, AgentVaultManager, AgentConfig } from '@chainvault/core';

interface AgentsScreenProps {
  agents: Array<{ name: string; chains: number[]; allowed_types: string[] }>;
  masterVault: MasterVault;
  agentManager: AgentVaultManager;
  onBack: () => void;
}

type Mode = 'list' | 'create-name' | 'create-chains' | 'create-types' | 'confirm-revoke' | 'show-key';

const VALID_TX_TYPES = ['deploy', 'write', 'transfer', 'read', 'simulate'];

export type { AgentsScreenProps };

export function AgentsScreen({ agents, masterVault, agentManager, onBack }: AgentsScreenProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [nameInput, setNameInput] = useState('');
  const [chainsInput, setChainsInput] = useState('');
  const [typesInput, setTypesInput] = useState('');
  const [vaultKey, setVaultKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelectedIndex((p) => Math.max(0, p - 1)); return; }
      if (key.downArrow) { setSelectedIndex((p) => Math.min(agents.length - 1, p + 1)); return; }
      if (input === 'a') {
        setNameInput(''); setChainsInput(''); setTypesInput(''); setError(null);
        setMode('create-name');
        return;
      }
      if (input === 'd' && agents.length > 0) {
        setError(null);
        setMode('confirm-revoke');
        return;
      }
      return;
    }

    if (mode === 'create-name') {
      if (key.escape) { setMode('list'); return; }
      if (key.return) {
        if (!nameInput.trim()) { setError('Name cannot be empty'); return; }
        setError(null); setMode('create-chains');
        return;
      }
      if (key.backspace || key.delete) { setNameInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setNameInput((p) => p + input); setError(null); }
      return;
    }

    if (mode === 'create-chains') {
      if (key.escape) { setMode('create-name'); return; }
      if (key.return) {
        const trimmed = chainsInput.trim();
        if (!trimmed) { setError('Chain IDs cannot be empty'); return; }
        const parts = trimmed.split(',').map((s) => s.trim());
        for (const part of parts) {
          const n = Number(part);
          if (!Number.isInteger(n) || n <= 0) { setError(`Invalid chain ID: ${part}`); return; }
        }
        setError(null); setMode('create-types');
        return;
      }
      if (key.backspace || key.delete) { setChainsInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setChainsInput((p) => p + input); setError(null); }
      return;
    }

    if (mode === 'create-types') {
      if (key.escape) { setMode('create-chains'); return; }
      if (key.return) {
        const trimmed = typesInput.trim();
        if (!trimmed) { setError('Tx types cannot be empty'); return; }
        const types = trimmed.split(',').map((s) => s.trim());
        for (const t of types) {
          if (!VALID_TX_TYPES.includes(t)) { setError(`Invalid tx type: ${t}`); return; }
        }
        setError(null);
        const chains = chainsInput.trim().split(',').map((s) => Number(s.trim()));
        const config: AgentConfig = {
          name: nameInput.trim(),
          chains,
          tx_rules: { allowed_types: types as AgentConfig['tx_rules']['allowed_types'], limits: {} },
          api_access: {},
          contract_rules: { mode: 'none' },
        };
        agentManager.createAgent(config, [], [])
          .then(({ vaultKey: key_ }) => {
            setVaultKey(key_);
            setMode('show-key');
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        return;
      }
      if (key.backspace || key.delete) { setTypesInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setTypesInput((p) => p + input); setError(null); }
      return;
    }

    if (mode === 'show-key') {
      setVaultKey('');
      setMode('list');
      return;
    }

    if (mode === 'confirm-revoke') {
      if (key.escape || input === 'n') { setMode('list'); return; }
      if (input === 'y') {
        const agentName = agents[selectedIndex]?.name;
        if (agentName) {
          agentManager.revokeAgent(agentName)
            .then(() => {
              setSelectedIndex((p) => Math.min(p, agents.length - 2));
              setMode('list');
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
              setMode('list');
            });
        }
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Agents</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>

      {mode === 'list' && (
        <>
          <Box marginTop={1} flexDirection="column">
            {agents.length === 0 ? (
              <Text dimColor>  No agents configured</Text>
            ) : (
              agents.map((a, i) => (
                <Text key={a.name}>
                  <Text color={i === selectedIndex ? 'cyan' : undefined}>
                    {i === selectedIndex ? '> ' : '  '}
                  </Text>
                  <Text bold={i === selectedIndex}>{a.name}</Text>
                  <Text dimColor> chains=[{a.chains.join(',')}] types=[{a.allowed_types.join(',')}]</Text>
                </Text>
              ))
            )}
          </Box>
          <Box marginTop={1}><Text dimColor>a add  d revoke  ↑↓ navigate  Esc back</Text></Box>
        </>
      )}

      {mode === 'create-name' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Agent name:</Text>
          <Box><Text>{'> '}</Text><Text>{nameInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'create-chains' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Chain IDs (comma-separated):</Text>
          <Box><Text>{'> '}</Text><Text>{chainsInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'create-types' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Tx types (comma-separated: deploy,write,transfer,read,simulate):</Text>
          <Box><Text>{'> '}</Text><Text>{typesInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'show-key' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>WARNING: Save this vault key now. It cannot be recovered.</Text>
          <Box marginTop={1}><Text>Vault Key: </Text><Text color="green">{vaultKey}</Text></Box>
          <Box marginTop={1}><Text dimColor>Press any key to continue</Text></Box>
        </Box>
      )}

      {mode === 'confirm-revoke' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Revoke agent &apos;{agents[selectedIndex]?.name}&apos;? (y/n)</Text>
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
