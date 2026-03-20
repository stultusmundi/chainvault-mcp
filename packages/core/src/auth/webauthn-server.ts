import { randomBytes } from 'node:crypto';

interface RegistrationOptions {
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout: number;
  attestation: string;
  authenticatorSelection: {
    authenticatorAttachment: string;
    residentKey: string;
    userVerification: string;
  };
}

interface AuthenticationOptions {
  challenge: string;
  rpId: string;
  timeout: number;
  allowCredentials: Array<{ id: string; type: 'public-key' }>;
  userVerification: string;
}

export class WebAuthnManager {
  private currentChallenge: string | null = null;

  generateRegistrationOptions(): RegistrationOptions {
    const challenge = randomBytes(32).toString('base64url');
    this.currentChallenge = challenge;
    return {
      rp: { name: 'ChainVault MCP', id: 'localhost' },
      user: {
        id: randomBytes(16).toString('base64url'),
        name: 'chainvault-admin',
        displayName: 'ChainVault Admin',
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
    };
  }

  generateAuthenticationOptions(credentialId: string): AuthenticationOptions {
    const challenge = randomBytes(32).toString('base64url');
    this.currentChallenge = challenge;
    return {
      challenge,
      rpId: 'localhost',
      timeout: 60000,
      allowCredentials: [{ id: credentialId, type: 'public-key' }],
      userVerification: 'required',
    };
  }

  getCurrentChallenge(): string | null {
    return this.currentChallenge;
  }
}
