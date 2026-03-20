import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MasterVault,
  AgentVaultManager,
  ChainVaultDB,
  AuditStore,
  DualKeyManager,
  WebAuthnManager,
  AuthLocalServer,
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
  const [hasPasskey, setHasPasskey] = useState(false);

  const lastActivity = useRef(Date.now());
  const dbRef = useRef<ChainVaultDB | null>(null);
  const auditStoreRef = useRef<AuditStore | null>(null);

  // Initialize DB and AuditStore once, and check for passkey
  useEffect(() => {
    if (!dbRef.current) {
      const db = new ChainVaultDB(basePath);
      dbRef.current = db;
      auditStoreRef.current = new AuditStore(db);
    }

    const dualKey = new DualKeyManager(basePath);
    setHasPasskey(dualKey.hasPasskey());

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

  const handlePasskeyRequest = useCallback(async () => {
    try {
      const dualKey = new DualKeyManager(basePath);
      const webauthn = new WebAuthnManager();
      const server = new AuthLocalServer();

      // Read stored credential ID from passkey.json
      const raw = await readFile(join(basePath, 'passkey.json'), 'utf8');
      const { credentialId } = JSON.parse(raw);

      // Generate auth options with the stored credential ID
      const options = webauthn.generateAuthenticationOptions(credentialId);

      const port = await server.start();

      // Open browser for WebAuthn authentication
      const { execFile: execFileCb } = await import('node:child_process');
      const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      execFileCb(openCmd, [server.getUrl('auth')]);

      // Wait for callback from browser
      const response = await server.waitForCallback() as { rawId?: string };
      await server.stop();

      if (!response.rawId) {
        setError('Passkey response missing credential data');
        return;
      }

      // Verify we got a valid credential back
      const rawId = Buffer.from(response.rawId, 'base64');
      // Attempt unlock with the passkey credential
      await dualKey.unlockWithPasskey(rawId);

      // Passkey verified, but MasterVault.unlock() still requires a password.
      // For vaults created with DualKeyManager the full flow will work in a future release.
      setError('Passkey verified! Enter password to complete unlock.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Passkey authentication failed';
      setError(message);
    }
  }, [basePath]);

  const handleBack = useCallback(() => {
    setScreen(null);
    refresh();
  }, [refresh]);

  // Locked state: show password prompt
  if (!vault) {
    return (
      <PasswordPrompt
        onSubmit={handlePasswordSubmit}
        error={error ?? undefined}
        hasPasskey={hasPasskey}
        onPasskeyRequest={handlePasskeyRequest}
      />
    );
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
