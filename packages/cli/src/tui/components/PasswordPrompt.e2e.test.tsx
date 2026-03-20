import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { PasswordPrompt } from './PasswordPrompt.js';
import { KEYS, type } from '../test-helpers.js';

// ink needs a tick for useEffect (which registers the useInput listener via setRawMode)
// to fire after the initial render. We need to await this before sending stdin input.
const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

describe('PasswordPrompt e2e', () => {
  it('renders dual-prompt (P/T options) when hasPasskey=true', () => {
    const { lastFrame } = render(
      <PasswordPrompt
        onSubmit={vi.fn()}
        hasPasskey={true}
        onPasskeyRequest={vi.fn()}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('[P]');
    expect(frame).toContain('[T]');
    expect(frame).toContain('Passkey');
    expect(frame).toContain('Type password');
  });

  it('renders password-only mode when hasPasskey=false', () => {
    const { lastFrame } = render(
      <PasswordPrompt onSubmit={vi.fn()} hasPasskey={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Enter master vault password');
    expect(frame).not.toContain('[P]');
    expect(frame).not.toContain('[T]');
  });

  it('P key triggers onPasskeyRequest callback', async () => {
    const onPasskeyRequest = vi.fn();
    const { stdin } = render(
      <PasswordPrompt
        onSubmit={vi.fn()}
        hasPasskey={true}
        onPasskeyRequest={onPasskeyRequest}
      />,
    );
    await delay();
    stdin.write('P');
    await delay();
    expect(onPasskeyRequest).toHaveBeenCalledTimes(1);
  });

  it('p key (lowercase) also triggers onPasskeyRequest', async () => {
    const onPasskeyRequest = vi.fn();
    const { stdin } = render(
      <PasswordPrompt
        onSubmit={vi.fn()}
        hasPasskey={true}
        onPasskeyRequest={onPasskeyRequest}
      />,
    );
    await delay();
    stdin.write('p');
    await delay();
    expect(onPasskeyRequest).toHaveBeenCalledTimes(1);
  });

  it('T key switches to password input mode', async () => {
    const { stdin, lastFrame } = render(
      <PasswordPrompt
        onSubmit={vi.fn()}
        hasPasskey={true}
        onPasskeyRequest={vi.fn()}
      />,
    );
    // Initially in select mode
    expect(lastFrame()!).toContain('[P]');

    await delay();
    stdin.write('T');
    await delay();

    // Now in password mode
    const frame = lastFrame()!;
    expect(frame).toContain('Enter master vault password');
    expect(frame).not.toContain('[P]');
  });

  it('typing renders asterisks (masked characters)', async () => {
    const { stdin, lastFrame } = render(
      <PasswordPrompt onSubmit={vi.fn()} hasPasskey={false} />,
    );
    await delay();
    type(stdin, 'abc');
    await delay();
    const frame = lastFrame()!;
    expect(frame).toContain('***');
    expect(frame).not.toContain('abc');
  });

  it('backspace removes last character', async () => {
    const { stdin, lastFrame } = render(
      <PasswordPrompt onSubmit={vi.fn()} hasPasskey={false} />,
    );
    await delay();
    type(stdin, 'abcd');
    await delay();
    expect(lastFrame()!).toContain('****');

    stdin.write(KEYS.BACKSPACE);
    await delay();
    expect(lastFrame()!).toContain('***');
    expect(lastFrame()!).not.toContain('****');
  });

  it('Enter with empty password shows "Password cannot be empty" validation error', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <PasswordPrompt onSubmit={onSubmit} hasPasskey={false} />,
    );
    await delay();
    stdin.write(KEYS.ENTER);
    await delay();
    expect(lastFrame()!).toContain('Password cannot be empty');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter with password calls onSubmit with correct value', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <PasswordPrompt onSubmit={onSubmit} hasPasskey={false} />,
    );
    await delay();
    type(stdin, 'my-secret-pass');
    await delay();
    stdin.write(KEYS.ENTER);
    await delay();
    expect(onSubmit).toHaveBeenCalledWith('my-secret-pass');
  });

  it('error prop displays error message', () => {
    const { lastFrame } = render(
      <PasswordPrompt
        onSubmit={vi.fn()}
        hasPasskey={false}
        error="Invalid password"
      />,
    );
    expect(lastFrame()!).toContain('Invalid password');
  });

  it('typing clears validation error', async () => {
    const { stdin, lastFrame } = render(
      <PasswordPrompt onSubmit={vi.fn()} hasPasskey={false} />,
    );
    await delay();
    // Trigger validation error
    stdin.write(KEYS.ENTER);
    await delay();
    expect(lastFrame()!).toContain('Password cannot be empty');

    // Type a character - should clear the validation error
    stdin.write('a');
    await delay();
    expect(lastFrame()!).not.toContain('Password cannot be empty');
  });
});
