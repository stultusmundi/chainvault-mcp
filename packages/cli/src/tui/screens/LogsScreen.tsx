import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AuditStore, AuditEntry } from '@chainvault/core';

interface LogsScreenProps {
  auditStore: AuditStore;
  onBack: () => void;
}

type FilterMode = 'all' | 'approved' | 'denied';
const FILTER_ORDER: FilterMode[] = ['all', 'approved', 'denied'];
const PAGE_SIZE = 15;

export type { LogsScreenProps };

export function LogsScreen({ auditStore, onBack }: LogsScreenProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [scrollOffset, setScrollOffset] = useState(0);

  const entries: AuditEntry[] = useMemo(() => {
    const filterOpts = filter === 'all' ? undefined : { status: filter as 'approved' | 'denied' };
    return auditStore.getEntries(filterOpts, 200);
  }, [auditStore, filter]);

  const visibleEntries = entries.slice(scrollOffset, scrollOffset + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.floor(scrollOffset / PAGE_SIZE) + 1;

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) { setScrollOffset((p) => Math.max(0, p - 1)); return; }
    if (key.downArrow) { setScrollOffset((p) => Math.min(Math.max(0, entries.length - PAGE_SIZE), p + 1)); return; }
    if (input === 'f') {
      const idx = FILTER_ORDER.indexOf(filter);
      const next = FILTER_ORDER[(idx + 1) % FILTER_ORDER.length]!;
      setFilter(next);
      setScrollOffset(0);
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Audit Logs</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>

      <Box marginTop={1}>
        <Text>Filter: </Text>
        <Text color="cyan" bold>{filter}</Text>
        <Text dimColor>  ({entries.length} entries, page {currentPage}/{totalPages})</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {entries.length === 0 ? (
          <Text dimColor>  No log entries</Text>
        ) : (
          visibleEntries.map((entry, i) => (
            <Text key={scrollOffset + i}>
              <Text dimColor>{entry.timestamp.slice(0, 19)} </Text>
              <Text color={entry.status === 'approved' ? 'green' : 'red'}>
                {entry.status === 'approved' ? '+' : 'x'}
              </Text>
              <Text> {entry.agent} </Text>
              <Text dimColor>{entry.action} chain:{entry.chain_id}</Text>
              {entry.details ? <Text dimColor> {entry.details}</Text> : null}
            </Text>
          ))
        )}
      </Box>

      <Box marginTop={1}><Text dimColor>f filter  ↑↓ scroll  Esc back</Text></Box>
    </Box>
  );
}
