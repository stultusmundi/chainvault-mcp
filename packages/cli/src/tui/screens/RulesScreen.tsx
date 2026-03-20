import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { MasterVault } from '@chainvault/core';

interface RulesScreenProps {
  agents: Array<{ name: string; chains: number[]; allowed_types: string[] }>;
  masterVault: MasterVault;
  onBack: () => void;
}

type Mode = 'select-agent' | 'edit-menu' | 'edit-chains' | 'edit-types' | 'edit-limits';
const MENU_ITEMS = ['Edit Chains', 'Edit Tx Types', 'Edit Limits', 'Back'] as const;
const VALID_TX_TYPES = ['deploy', 'write', 'transfer', 'read', 'simulate'];

export type { RulesScreenProps };

export function RulesScreen({ agents, masterVault, onBack }: RulesScreenProps) {
  const [mode, setMode] = useState<Mode>('select-agent');
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [chainsInput, setChainsInput] = useState('');
  const [typesInput, setTypesInput] = useState('');
  const [limitsInput, setLimitsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currentAgentName = agents[selectedAgent]?.name;

  useInput((input, key) => {
    if (mode === 'select-agent') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelectedAgent((p) => Math.max(0, p - 1)); return; }
      if (key.downArrow) { setSelectedAgent((p) => Math.min(agents.length - 1, p + 1)); return; }
      if (key.return && agents.length > 0) {
        setMenuIndex(0); setError(null); setMessage(null);
        setMode('edit-menu');
        return;
      }
      return;
    }

    if (mode === 'edit-menu') {
      if (key.escape) { setMode('select-agent'); return; }
      if (key.upArrow) { setMenuIndex((p) => Math.max(0, p - 1)); return; }
      if (key.downArrow) { setMenuIndex((p) => Math.min(MENU_ITEMS.length - 1, p + 1)); return; }
      if (key.return) {
        const item = MENU_ITEMS[menuIndex];
        if (item === 'Back') { setMode('select-agent'); return; }
        if (item === 'Edit Chains') {
          const agent = agents[selectedAgent];
          setChainsInput(agent ? agent.chains.join(',') : '');
          setError(null); setMessage(null); setMode('edit-chains');
          return;
        }
        if (item === 'Edit Tx Types') {
          const agent = agents[selectedAgent];
          setTypesInput(agent ? agent.allowed_types.join(',') : '');
          setError(null); setMessage(null); setMode('edit-types');
          return;
        }
        if (item === 'Edit Limits') {
          setLimitsInput('');
          setError(null); setMessage(null); setMode('edit-limits');
          return;
        }
      }
      return;
    }

    if (mode === 'edit-chains') {
      if (key.escape) { setMode('edit-menu'); return; }
      if (key.return) {
        const trimmed = chainsInput.trim();
        if (!trimmed) { setError('Chain IDs cannot be empty'); return; }
        const parts = trimmed.split(',').map((s) => s.trim());
        const chains: number[] = [];
        for (const part of parts) {
          const n = Number(part);
          if (!Number.isInteger(n) || n <= 0) { setError(`Invalid chain ID: ${part}`); return; }
          chains.push(n);
        }
        if (!currentAgentName) return;
        const data = masterVault.getData();
        const agentConfig = data.agents[currentAgentName];
        if (agentConfig) {
          agentConfig.chains = chains;
          masterVault.saveData()
            .then(() => { setMessage('Chains updated'); setMode('edit-menu'); })
            .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); });
        }
        return;
      }
      if (key.backspace || key.delete) { setChainsInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setChainsInput((p) => p + input); setError(null); }
      return;
    }

    if (mode === 'edit-types') {
      if (key.escape) { setMode('edit-menu'); return; }
      if (key.return) {
        const trimmed = typesInput.trim();
        if (!trimmed) { setError('Tx types cannot be empty'); return; }
        const types = trimmed.split(',').map((s) => s.trim());
        for (const t of types) {
          if (!VALID_TX_TYPES.includes(t)) { setError(`Invalid tx type: ${t}`); return; }
        }
        if (!currentAgentName) return;
        const data = masterVault.getData();
        const agentConfig = data.agents[currentAgentName];
        if (agentConfig) {
          agentConfig.tx_rules.allowed_types = types as typeof agentConfig.tx_rules.allowed_types;
          masterVault.saveData()
            .then(() => { setMessage('Tx types updated'); setMode('edit-menu'); })
            .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); });
        }
        return;
      }
      if (key.backspace || key.delete) { setTypesInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setTypesInput((p) => p + input); setError(null); }
      return;
    }

    if (mode === 'edit-limits') {
      if (key.escape) { setMode('edit-menu'); return; }
      if (key.return) {
        // Format: chainId:maxPerTx:daily:monthly (e.g. "1:1.0:10.0:100.0")
        const trimmed = limitsInput.trim();
        if (!trimmed) { setError('Limits cannot be empty (format: chainId:maxPerTx:daily:monthly)'); return; }
        const parts = trimmed.split(':');
        if (parts.length !== 4) { setError('Format: chainId:maxPerTx:daily:monthly'); return; }
        const [chainId, maxPerTx, daily, monthly] = parts as [string, string, string, string];
        const chainNum = Number(chainId);
        if (!Number.isInteger(chainNum) || chainNum <= 0) { setError('Invalid chain ID'); return; }
        if (!currentAgentName) return;
        const data = masterVault.getData();
        const agentConfig = data.agents[currentAgentName];
        if (agentConfig) {
          agentConfig.tx_rules.limits[String(chainNum)] = {
            max_per_tx: maxPerTx,
            daily_limit: daily,
            monthly_limit: monthly,
          };
          masterVault.saveData()
            .then(() => { setMessage('Limits updated'); setMode('edit-menu'); })
            .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); });
        }
        return;
      }
      if (key.backspace || key.delete) { setLimitsInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setLimitsInput((p) => p + input); setError(null); }
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Rules</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>

      {mode === 'select-agent' && (
        <>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Select agent to edit:</Text>
            {agents.length === 0 ? (
              <Text dimColor>  No agents configured</Text>
            ) : (
              agents.map((a, i) => (
                <Text key={a.name}>
                  <Text color={i === selectedAgent ? 'cyan' : undefined}>
                    {i === selectedAgent ? '> ' : '  '}
                  </Text>
                  <Text bold={i === selectedAgent}>{a.name}</Text>
                  <Text dimColor> chains=[{a.chains.join(',')}] types=[{a.allowed_types.join(',')}]</Text>
                </Text>
              ))
            )}
          </Box>
          <Box marginTop={1}><Text dimColor>Enter select  ↑↓ navigate  Esc back</Text></Box>
        </>
      )}

      {mode === 'edit-menu' && (
        <>
          <Box marginTop={1}><Text>Editing: <Text bold>{currentAgentName}</Text></Text></Box>
          <Box marginTop={1} flexDirection="column">
            {MENU_ITEMS.map((item, i) => (
              <Text key={item}>
                <Text color={i === menuIndex ? 'cyan' : undefined}>
                  {i === menuIndex ? '> ' : '  '}
                </Text>
                <Text bold={i === menuIndex}>{item}</Text>
              </Text>
            ))}
          </Box>
          {message && <Box marginTop={1}><Text color="green">{message}</Text></Box>}
          <Box marginTop={1}><Text dimColor>Enter select  ↑↓ navigate  Esc back</Text></Box>
        </>
      )}

      {mode === 'edit-chains' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Chains for {currentAgentName} (comma-separated):</Text>
          <Box><Text>{'> '}</Text><Text>{chainsInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'edit-types' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Tx types for {currentAgentName} (deploy,write,transfer,read,simulate):</Text>
          <Box><Text>{'> '}</Text><Text>{typesInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'edit-limits' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Limits for {currentAgentName} (format: chainId:maxPerTx:daily:monthly):</Text>
          <Box><Text>{'> '}</Text><Text>{limitsInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
