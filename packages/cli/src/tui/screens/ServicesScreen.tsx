import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface ServicesScreenProps {
  apiKeys: Array<{ name: string; base_url: string }>;
  rpcEndpoints: Array<{ name: string; url: string; chain_id: number }>;
  onAddApiKey: (name: string, key: string, url: string) => Promise<void>;
  onRemoveApiKey: (name: string) => Promise<void>;
  onAddRpcEndpoint: (name: string, url: string, chainId: number) => Promise<void>;
  onRemoveRpcEndpoint: (name: string) => Promise<void>;
  onBack: () => void;
}

type Section = 'api' | 'rpc';
type Mode = 'list' | 'add-name' | 'add-value' | 'add-url' | 'add-chain' | 'confirm-delete';

export type { ServicesScreenProps };

export function ServicesScreen({
  apiKeys, rpcEndpoints,
  onAddApiKey, onRemoveApiKey, onAddRpcEndpoint, onRemoveRpcEndpoint,
  onBack,
}: ServicesScreenProps) {
  const [section, setSection] = useState<Section>('api');
  const [mode, setMode] = useState<Mode>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [nameInput, setNameInput] = useState('');
  const [valueInput, setValueInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [chainInput, setChainInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentList = section === 'api' ? apiKeys : rpcEndpoints;

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.escape) { onBack(); return; }
      if (key.tab) {
        setSection((s) => s === 'api' ? 'rpc' : 'api');
        setSelectedIndex(0); setError(null);
        return;
      }
      if (key.upArrow) { setSelectedIndex((p) => Math.max(0, p - 1)); return; }
      if (key.downArrow) { setSelectedIndex((p) => Math.min(currentList.length - 1, p + 1)); return; }
      if (input === 'a') {
        setNameInput(''); setValueInput(''); setUrlInput(''); setChainInput(''); setError(null);
        setMode('add-name');
        return;
      }
      if (input === 'd' && currentList.length > 0) {
        setError(null); setMode('confirm-delete');
        return;
      }
      return;
    }

    if (mode === 'add-name') {
      if (key.escape) { setMode('list'); return; }
      if (key.return) {
        if (!nameInput.trim()) { setError('Name cannot be empty'); return; }
        setError(null);
        setMode(section === 'api' ? 'add-value' : 'add-url');
        return;
      }
      if (key.backspace || key.delete) { setNameInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setNameInput((p) => p + input); setError(null); }
      return;
    }

    // API key flow: add-value -> add-url -> done
    if (mode === 'add-value') {
      if (key.escape) { setMode('add-name'); return; }
      if (key.return) {
        if (!valueInput.trim()) { setError('API key cannot be empty'); return; }
        setError(null); setMode('add-url');
        return;
      }
      if (key.backspace || key.delete) { setValueInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setValueInput((p) => p + input); setError(null); }
      return;
    }

    if (mode === 'add-url') {
      if (key.escape) { setMode(section === 'api' ? 'add-value' : 'add-name'); return; }
      if (key.return) {
        if (!urlInput.trim()) { setError('URL cannot be empty'); return; }
        setError(null);
        if (section === 'api') {
          onAddApiKey(nameInput.trim(), valueInput.trim(), urlInput.trim())
            .then(() => { setMode('list'); })
            .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); });
        } else {
          setMode('add-chain');
        }
        return;
      }
      if (key.backspace || key.delete) { setUrlInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setUrlInput((p) => p + input); setError(null); }
      return;
    }

    // RPC flow: add-name -> add-url -> add-chain -> done
    if (mode === 'add-chain') {
      if (key.escape) { setMode('add-url'); return; }
      if (key.return) {
        const n = Number(chainInput.trim());
        if (!Number.isInteger(n) || n <= 0) { setError('Invalid chain ID'); return; }
        setError(null);
        onAddRpcEndpoint(nameInput.trim(), urlInput.trim(), n)
          .then(() => { setMode('list'); })
          .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); });
        return;
      }
      if (key.backspace || key.delete) { setChainInput((p) => p.slice(0, -1)); setError(null); return; }
      if (input && !key.ctrl && !key.meta) { setChainInput((p) => p + input); setError(null); }
      return;
    }

    if (mode === 'confirm-delete') {
      if (key.escape || input === 'n') { setMode('list'); return; }
      if (input === 'y') {
        const item = currentList[selectedIndex];
        if (item) {
          const promise = section === 'api'
            ? onRemoveApiKey(item.name)
            : onRemoveRpcEndpoint(item.name);
          promise
            .then(() => { setSelectedIndex((p) => Math.min(p, currentList.length - 2)); setMode('list'); })
            .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)); setMode('list'); });
        }
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Services</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>

      {mode === 'list' && (
        <>
          <Box marginTop={1} flexDirection="column">
            <Text bold color={section === 'api' ? 'cyan' : undefined}>API Keys</Text>
            {apiKeys.length === 0 ? (
              <Text dimColor>  No API keys</Text>
            ) : (
              apiKeys.map((a, i) => {
                const active = section === 'api';
                const sel = active && i === selectedIndex;
                return (
                  <Text key={a.name}>
                    <Text color={sel ? 'cyan' : undefined}>{sel ? '> ' : '  '}</Text>
                    <Text bold={sel}>{a.name}</Text>
                    <Text dimColor> {a.base_url}</Text>
                  </Text>
                );
              })
            )}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text bold color={section === 'rpc' ? 'cyan' : undefined}>RPC Endpoints</Text>
            {rpcEndpoints.length === 0 ? (
              <Text dimColor>  No RPC endpoints</Text>
            ) : (
              rpcEndpoints.map((r, i) => {
                const active = section === 'rpc';
                const sel = active && i === selectedIndex;
                return (
                  <Text key={r.name}>
                    <Text color={sel ? 'cyan' : undefined}>{sel ? '> ' : '  '}</Text>
                    <Text bold={sel}>{r.name}</Text>
                    <Text dimColor> {r.url} (chain {r.chain_id})</Text>
                  </Text>
                );
              })
            )}
          </Box>

          <Box marginTop={1}><Text dimColor>Tab switch  a add  d delete  ↑↓ navigate  Esc back</Text></Box>
        </>
      )}

      {mode === 'add-name' && (
        <Box marginTop={1} flexDirection="column">
          <Text>{section === 'api' ? 'API key' : 'RPC endpoint'} name:</Text>
          <Box><Text>{'> '}</Text><Text>{nameInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'add-value' && (
        <Box marginTop={1} flexDirection="column">
          <Text>API key value:</Text>
          <Box><Text>{'> '}</Text><Text>{'*'.repeat(valueInput.length)}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'add-url' && (
        <Box marginTop={1} flexDirection="column">
          <Text>{section === 'api' ? 'Base URL' : 'RPC URL'}:</Text>
          <Box><Text>{'> '}</Text><Text>{urlInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'add-chain' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Chain ID:</Text>
          <Box><Text>{'> '}</Text><Text>{chainInput}</Text><Text dimColor>{'█'}</Text></Box>
        </Box>
      )}

      {mode === 'confirm-delete' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Delete {section === 'api' ? 'API key' : 'RPC endpoint'} &apos;{currentList[selectedIndex]?.name}&apos;? (y/n)</Text>
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
