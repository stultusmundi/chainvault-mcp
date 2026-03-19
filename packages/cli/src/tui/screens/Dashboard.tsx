import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { AuditEntry } from '@chainvault/core';

interface DashboardProps {
  vaultPath: string;
  keyCount: number;
  agentCount: number;
  rpcCount: number;
  recentActivity: AuditEntry[];
  onBack: () => void;
}

export function Dashboard({ vaultPath, keyCount, agentCount, rpcCount, recentActivity, onBack }: DashboardProps) {
  useInput((_input, key) => { if (key.escape) onBack(); });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Dashboard</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Vault: <Text color="green">unlocked</Text></Text>
        <Text>Path:  <Text dimColor>{vaultPath}</Text></Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Resources</Text>
        <Text>  Keys:      {keyCount}</Text>
        <Text>  Agents:    {agentCount}</Text>
        <Text>  Endpoints: {rpcCount}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Recent Activity</Text>
        {recentActivity.length === 0 ? (
          <Text dimColor>  No activity yet</Text>
        ) : (
          recentActivity.slice(0, 10).map((entry, i) => (
            <Text key={i}>
              <Text dimColor>{entry.timestamp.slice(11, 19)} </Text>
              <Text color={entry.status === 'approved' ? 'green' : 'red'}>
                {entry.status === 'approved' ? '+' : 'x'}
              </Text>
              <Text> {entry.agent} {entry.action}</Text>
            </Text>
          ))
        )}
      </Box>
      <Box marginTop={1}><Text dimColor>Esc back</Text></Box>
    </Box>
  );
}
