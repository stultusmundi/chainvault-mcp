import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export type Screen = 'dashboard' | 'keys' | 'agents' | 'services' | 'logs' | 'rules';

const MENU_ITEMS: { label: string; value: Screen }[] = [
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Keys', value: 'keys' },
  { label: 'Agents', value: 'agents' },
  { label: 'Services', value: 'services' },
  { label: 'Logs', value: 'logs' },
  { label: 'Rules', value: 'rules' },
];

interface MainMenuProps {
  agentCount: number;
  keyCount: number;
  onSelect: (screen: Screen) => void;
}

export function MainMenu({ agentCount, keyCount, onSelect }: MainMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex((i) => (i > 0 ? i - 1 : MENU_ITEMS.length - 1));
    if (key.downArrow) setSelectedIndex((i) => (i < MENU_ITEMS.length - 1 ? i + 1 : 0));
    if (key.return) onSelect(MENU_ITEMS[selectedIndex].value);
    if (input === 'q') process.exit(0);
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>ChainVault MCP</Text>
        <Text dimColor> — {keyCount} keys, {agentCount} agents</Text>
      </Box>
      {MENU_ITEMS.map((item, i) => (
        <Box key={item.value}>
          <Text color={i === selectedIndex ? 'cyan' : undefined} bold={i === selectedIndex}>
            {i === selectedIndex ? '> ' : '  '}{item.label}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>arrows navigate / Enter select / q quit</Text>
      </Box>
    </Box>
  );
}
