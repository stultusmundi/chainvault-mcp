# WebAuthn/Passkey + Contract Compilation Design

## Goal

Complete the V1.1 roadmap with two remaining features: WebAuthn/Passkey authentication as an alternative to password-based vault unlock, and Solidity contract compilation via Docker (preferred) or local solc fallback.

---

## 1. WebAuthn/Passkey Authentication

### Overview

Add passkey-based vault unlock alongside the existing password method. Both remain available at all times — no lock-out risk. Uses a temporary local HTTP server + browser popup for the WebAuthn ceremony, similar to `gh auth login`.

### Registration Flow (one-time)

1. User selects "Register Passkey" from TUI or during `chainvault init`
2. TUI starts a temporary HTTP server on `localhost:<random-port>`
3. TUI opens the user's default browser to `localhost:port/register`
4. Browser page triggers WebAuthn `navigator.credentials.create()` (Touch ID / Face ID / security key)
5. Browser sends the credential response back to the localhost server
6. Server extracts credential ID and public key
7. Server stores credential metadata in `~/.chainvault/passkey.json`
8. Server re-encrypts the vault: stores the master key encrypted with both the password-derived key AND the passkey-derived key
9. Server shuts down, browser tab can close
10. TUI confirms "Passkey registered"

### Unlock Flow

1. TUI shows prompt: `[P]asskey or [T]ype password`
2. If Passkey:
   - Start temporary HTTP server on `localhost:<random-port>`
   - Open browser to `localhost:port/auth`
   - Browser triggers `navigator.credentials.get()` (biometric prompt)
   - Browser sends assertion response to localhost callback
   - Server verifies assertion against stored public key using `@simplewebauthn/server`
   - Server uses the credential's raw ID as HKDF input to derive the master key
   - Server decrypts the vault, shuts down
   - TUI unlocks
3. If Password:
   - Same as current flow (masked input → HKDF → decrypt)

### Dual-Key Vault Encryption

To support both auth methods unlocking the same vault, the vault file stores the encrypted data once but the master key is stored encrypted with both derivation paths:

```
~/.chainvault/
  master.vault      # encrypted vault data (unchanged)
  master.salt       # salt for key derivation (unchanged)
  passkey.json      # credential ID, public key, encrypted master key copy
```

On `init` or passkey registration:
- Generate a random master key
- Encrypt vault data with the master key
- Encrypt the master key with `HKDF(password, salt)` -> store in `master.vault` header
- Encrypt the master key with `HKDF(credential_raw_id, salt)` -> store in `passkey.json`

On unlock:
- Password path: derive key from password, decrypt master key from vault header, use master key to decrypt vault
- Passkey path: derive key from credential raw ID, decrypt master key from passkey.json, use master key to decrypt vault

### New Dependencies

- `@simplewebauthn/server` — server-side WebAuthn registration and verification
- Static HTML/JS for browser pages (bundled as string templates, no build step)

### Security Considerations

- HTTP server binds to `127.0.0.1` only (not 0.0.0.0)
- Server uses a random port and a one-time challenge token
- Server shuts down immediately after receiving the response
- Credential private key never leaves the authenticator (by WebAuthn design)
- Passkey.json stores only the public key and encrypted master key — not useful without the authenticator

---

## 2. Contract Compilation

### Overview

New `SolidityCompiler` module that compiles Solidity source code using solc. Prefers Docker (`ethereum/solc` images) for exact version matching, falls back to local `solc` if Docker is unavailable and the local version matches.

### Compile Flow

```
compile_contract(source, version, options)
  -> Build solc standard-json input
  -> Try Docker: docker run --rm -i ethereum/solc:<version> --standard-json
  -> If Docker unavailable:
      -> Check local solc --version
      -> If version matches: solc --standard-json
      -> If mismatch: error with clear message
  -> Parse standard-json output
  -> Return { abi, bytecode, warnings }
```

### Standard JSON Interface

Input (built by SolidityCompiler):
```json
{
  "language": "Solidity",
  "sources": {
    "Contract.sol": { "content": "<source code>" }
  },
  "settings": {
    "outputSelection": { "*": { "*": ["abi", "evm.bytecode.object"] } },
    "optimizer": { "enabled": true, "runs": 200 }
  }
}
```

Output parsing: extract `contracts.Contract.sol.<ContractName>.abi` and `contracts.Contract.sol.<ContractName>.evm.bytecode.object`.

### MCP Tool

```
compile_contract
  Inputs:
    - source_code: string        # Solidity source
    - compiler_version: string   # e.g., "0.8.26"
    - contract_name: string      # Which contract to extract from output
    - optimization: boolean      # default: true
    - optimization_runs: number  # default: 200
  Returns:
    - abi: string (JSON)
    - bytecode: string (0x-prefixed)
    - warnings: string[]
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Docker available | Use `ethereum/solc:<version>` image (pull if needed) |
| Docker unavailable, local solc matches version | Use local solc |
| Docker unavailable, local solc wrong version | Error: "Local solc is vX.Y.Z but vA.B.C requested. Install Docker for automatic version management." |
| No Docker, no local solc | Error: "No Solidity compiler found. Install Docker or solc." |
| Solidity compilation errors | Return solc error messages directly |

### No New Dependencies

Uses `execFile` (not `exec`) to shell out to `docker` or `solc` safely. No npm packages needed.

### Module Location

`packages/core/src/compiler/solidity.ts` — the `SolidityCompiler` class
`packages/core/src/compiler/solidity.test.ts` — tests (mock execFile)

---

## 3. TUI Integration

### Password Prompt Changes

Current `PasswordPrompt` component gets a new mode: shows `[P]asskey or [T]ype password` when a passkey is registered, falls back to password-only when no passkey exists.

### New TUI Flow

```
App launch
  -> Check if passkey.json exists
  -> If yes: show dual prompt (passkey or password)
  -> If no: show password prompt (same as today)
```

### Passkey Registration in TUI

Add "Register Passkey" option to the Dashboard or a new Settings screen. Opens browser for the WebAuthn ceremony.
