import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface PasswordPromptProps {
  onSubmit: (password: string) => void;
  error?: string;
  hasPasskey?: boolean;
  onPasskeyRequest?: () => void;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password cannot be empty';
  return null;
}

export function PasswordPrompt({ onSubmit, error, hasPasskey, onPasskeyRequest }: PasswordPromptProps) {
  const [mode, setMode] = useState<'select' | 'password'>(hasPasskey ? 'select' : 'password');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useInput((input, key) => {
    if (mode === 'select') {
      if (input === 'p' || input === 'P') {
        onPasskeyRequest?.();
        return;
      }
      if (input === 't' || input === 'T') {
        setMode('password');
        return;
      }
      return;
    }

    // password mode
    if (key.return) {
      const err = validatePassword(password);
      if (err) { setValidationError(err); return; }
      onSubmit(password);
      return;
    }
    if (key.backspace || key.delete) {
      setPassword((prev) => prev.slice(0, -1));
      setValidationError(null);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setPassword((prev) => prev + input);
      setValidationError(null);
    }
  });

  if (mode === 'select') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>ChainVault</Text>
        <Text> </Text>
        <Text>Unlock your vault:</Text>
        <Text>  [P] Passkey (Touch ID / Security Key)</Text>
        <Text>  [T] Type password</Text>
        <Text> </Text>
        <Text dimColor>Press P or T to choose</Text>
        {error && <Text color="red">{error}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>ChainVault</Text>
      <Text> </Text>
      <Text>Enter master vault password:</Text>
      <Box>
        <Text>{'> '}</Text>
        <Text>{'*'.repeat(password.length)}</Text>
        <Text dimColor>{'█'}</Text>
      </Box>
      {(error || validationError) && (
        <Text color="red">{error || validationError}</Text>
      )}
    </Box>
  );
}
