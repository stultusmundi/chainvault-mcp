import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface KeyInfo {
  name: string;
  address: string;
  chains: number[];
}

interface KeysScreenProps {
  keys: KeyInfo[];
  onAddKey: (name: string, privateKey: string, chains: number[]) => Promise<void>;
  onRemoveKey: (name: string) => Promise<void>;
  onBack: () => void;
}

type Mode = 'list' | 'add-name' | 'add-key' | 'add-chains' | 'confirm-delete';

export type { KeyInfo, KeysScreenProps };

export function KeysScreen({ keys, onAddKey, onRemoveKey, onBack }: KeysScreenProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [nameInput, setNameInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [chainsInput, setChainsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(keys.length - 1, prev + 1));
        return;
      }
      if (input === 'a') {
        setMode('add-name');
        setNameInput('');
        setKeyInput('');
        setChainsInput('');
        setError(null);
        return;
      }
      if (input === 'd' && keys.length > 0) {
        setError(null);
        setMode('confirm-delete');
        return;
      }
      return;
    }

    if (mode === 'add-name') {
      if (key.escape) {
        setMode('list');
        return;
      }
      if (key.return) {
        if (!nameInput.trim()) {
          setError('Name cannot be empty');
          return;
        }
        setError(null);
        setMode('add-key');
        return;
      }
      if (key.backspace || key.delete) {
        setNameInput((prev) => prev.slice(0, -1));
        setError(null);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setNameInput((prev) => prev + input);
        setError(null);
      }
      return;
    }

    if (mode === 'add-key') {
      if (key.escape) {
        setMode('add-name');
        return;
      }
      if (key.return) {
        if (!keyInput.trim()) {
          setError('Private key cannot be empty');
          return;
        }
        setError(null);
        setMode('add-chains');
        return;
      }
      if (key.backspace || key.delete) {
        setKeyInput((prev) => prev.slice(0, -1));
        setError(null);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setKeyInput((prev) => prev + input);
        setError(null);
      }
      return;
    }

    if (mode === 'add-chains') {
      if (key.escape) {
        setMode('add-key');
        return;
      }
      if (key.return) {
        const trimmed = chainsInput.trim();
        if (!trimmed) {
          setError('Chain IDs cannot be empty');
          return;
        }
        const parts = trimmed.split(',').map((s) => s.trim());
        const chains: number[] = [];
        for (const part of parts) {
          const n = Number(part);
          if (!Number.isInteger(n) || n <= 0) {
            setError(`Invalid chain ID: ${part}`);
            return;
          }
          chains.push(n);
        }
        setError(null);
        onAddKey(nameInput.trim(), keyInput.trim(), chains)
          .then(() => {
            setMode('list');
            setNameInput('');
            setKeyInput('');
            setChainsInput('');
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
          });
        return;
      }
      if (key.backspace || key.delete) {
        setChainsInput((prev) => prev.slice(0, -1));
        setError(null);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setChainsInput((prev) => prev + input);
        setError(null);
      }
      return;
    }

    if (mode === 'confirm-delete') {
      if (key.escape || input === 'n') {
        setMode('list');
        return;
      }
      if (input === 'y') {
        const keyName = keys[selectedIndex]?.name;
        if (keyName) {
          onRemoveKey(keyName)
            .then(() => {
              setSelectedIndex((prev) => Math.min(prev, keys.length - 2));
              setMode('list');
            })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              setError(message);
              setMode('list');
            });
        }
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Keys</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>

      {mode === 'list' && (
        <>
          <Box marginTop={1} flexDirection="column">
            {keys.length === 0 ? (
              <Text dimColor>  No keys stored</Text>
            ) : (
              keys.map((k, i) => (
                <Text key={k.name}>
                  <Text color={i === selectedIndex ? 'cyan' : undefined}>
                    {i === selectedIndex ? '> ' : '  '}
                  </Text>
                  <Text bold={i === selectedIndex}>{k.name}</Text>
                  <Text dimColor> {k.address} </Text>
                  <Text dimColor>[{k.chains.join(', ')}]</Text>
                </Text>
              ))
            )}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>a add  d delete  ↑↓ navigate  Esc back</Text>
          </Box>
        </>
      )}

      {mode === 'add-name' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Key name:</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{nameInput}</Text>
            <Text dimColor>{'█'}</Text>
          </Box>
        </Box>
      )}

      {mode === 'add-key' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Private key for &quot;{nameInput}&quot;:</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{'*'.repeat(keyInput.length)}</Text>
            <Text dimColor>{'█'}</Text>
          </Box>
        </Box>
      )}

      {mode === 'add-chains' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Chain IDs (comma-separated):</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{chainsInput}</Text>
            <Text dimColor>{'█'}</Text>
          </Box>
        </Box>
      )}

      {mode === 'confirm-delete' && (
        <Box marginTop={1} flexDirection="column">
          <Text>Delete key &apos;{keys[selectedIndex]?.name}&apos;? (y/n)</Text>
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
