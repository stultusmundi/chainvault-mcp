import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  MasterVault,
  AgentVaultManager,
  ChainVaultDB,
  AuditStore,
} from '@chainvault/core';

import { PasswordPrompt } from './components/PasswordPrompt.js';
import { MainMenu, type Screen } from './components/MainMenu.js';
import { Dashboard } from './screens/Dashboard.js';
import { KeysScreen } from './screens/KeysScreen.js';
import { AgentsScreen } from './screens/AgentsScreen.js';
import { ServicesScreen } from './screens/ServicesScreen.js';
import { LogsScreen } from './screens/LogsScreen.js';
import { RulesScreen } from './screens/RulesScreen.js';

const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes
const CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds

interface AppProps {
  basePath: string;
}

export function App({ basePath }: AppProps) {
  const [vault, setVault] = useState<MasterVault | null>(null);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const lastActivity = useRef(Date.now());
  const dbRef = useRef<ChainVaultDB | null>(null);
  const auditStoreRef = useRef<AuditStore | null>(null);

  // Initialize DB and AuditStore once
  useEffect(() => {
    if (!dbRef.current) {
      const db = new ChainVaultDB(basePath);
      dbRef.current = db;
      auditStoreRef.current = new AuditStore(db);
    }
    return () => {
      dbRef.current?.close();
    };
  }, [basePath]);

  // Auto-lock timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (vault && Date.now() - lastActivity.current > AUTO_LOCK_MS) {
        vault.lock();
        setVault(null);
        setScreen(null);
        setError(null);
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [vault]);

  // Reset activity on any input
  useInput(() => {
    lastActivity.current = Date.now();
  });

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  const handlePasswordSubmit = useCallback(async (password: string) => {
    try {
      const v = await MasterVault.unlock(basePath, password);
      setVault(v);
      setError(null);
      lastActivity.current = Date.now();
    } catch {
      setError('Wrong password');
    }
  }, [basePath]);

  const handleBack = useCallback(() => {
    setScreen(null);
    refresh();
  }, [refresh]);

  // Locked state: show password prompt
  if (!vault) {
    return <PasswordPrompt onSubmit={handlePasswordSubmit} error={error ?? undefined} />;
  }

  // Menu state: show main menu
  if (screen === null) {
    const keys = vault.listKeys();
    const agentManager = new AgentVaultManager(basePath, vault);
    const agents = agentManager.listAgents();

    return (
      <MainMenu
        keyCount={keys.length}
        agentCount={agents.length}
        onSelect={setScreen}
      />
    );
  }

  // Screen routing
  const agentManager = new AgentVaultManager(basePath, vault);
  const auditStore = auditStoreRef.current!;

  switch (screen) {
    case 'dashboard': {
      const keys = vault.listKeys();
      const agents = agentManager.listAgents();
      const rpcEndpoints = vault.listRpcEndpoints();
      const recentActivity = auditStore.getEntries(undefined, 10);
      return (
        <Dashboard
          vaultPath={basePath}
          keyCount={keys.length}
          agentCount={agents.length}
          rpcCount={rpcEndpoints.length}
          recentActivity={recentActivity}
          onBack={handleBack}
        />
      );
    }
    case 'keys': {
      const keys = vault.listKeys();
      return (
        <KeysScreen
          keys={keys}
          onAddKey={async (name, privateKey, chains) => {
            await vault.addKey(name, privateKey, chains);
            refresh();
          }}
          onRemoveKey={async (name) => {
            await vault.removeKey(name);
            refresh();
          }}
          onBack={handleBack}
        />
      );
    }
    case 'agents': {
      const agents = agentManager.listAgents();
      return (
        <AgentsScreen
          agents={agents}
          masterVault={vault}
          agentManager={agentManager}
          onBack={handleBack}
        />
      );
    }
    case 'services': {
      const apiKeys = vault.listApiKeys();
      const rpcEndpoints = vault.listRpcEndpoints();
      return (
        <ServicesScreen
          apiKeys={apiKeys}
          rpcEndpoints={rpcEndpoints}
          onAddApiKey={async (name, key, url) => {
            await vault.addApiKey(name, key, url);
            refresh();
          }}
          onRemoveApiKey={async (name) => {
            await vault.removeApiKey(name);
            refresh();
          }}
          onAddRpcEndpoint={async (name, url, chainId) => {
            await vault.addRpcEndpoint(name, url, chainId);
            refresh();
          }}
          onRemoveRpcEndpoint={async (name) => {
            await vault.removeRpcEndpoint(name);
            refresh();
          }}
          onBack={handleBack}
        />
      );
    }
    case 'logs': {
      return (
        <LogsScreen
          auditStore={auditStore}
          onBack={handleBack}
        />
      );
    }
    case 'rules': {
      const agents = agentManager.listAgents();
      return (
        <RulesScreen
          agents={agents}
          masterVault={vault}
          onBack={handleBack}
        />
      );
    }
    default: {
      return (
        <Box>
          <Text color="red">Unknown screen: {screen}</Text>
        </Box>
      );
    }
  }
}
