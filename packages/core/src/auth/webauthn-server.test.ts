import { describe, it, expect } from 'vitest';
import { WebAuthnManager } from './webauthn-server.js';

describe('WebAuthnManager', () => {
  it('generates registration options with correct rp name', () => {
    const manager = new WebAuthnManager();
    const options = manager.generateRegistrationOptions();
    expect(options.rp.name).toBe('ChainVault MCP');
    expect(options.rp.id).toBe('localhost');
    expect(options.challenge).toBeDefined();
  });

  it('generates authentication options', () => {
    const manager = new WebAuthnManager();
    const credentialId = 'dGVzdC1jcmVkZW50aWFs';
    const options = manager.generateAuthenticationOptions(credentialId);
    expect(options.challenge).toBeDefined();
    expect(options.rpId).toBe('localhost');
  });

  it('stores and retrieves challenge', () => {
    const manager = new WebAuthnManager();
    const options = manager.generateRegistrationOptions();
    expect(manager.getCurrentChallenge()).toBe(options.challenge);
  });
});
