# Per-Request Vault Decryption — Design

**Date:** 2026-09-07
**Status:** Proposed
**Issues:** #10 (decrypted vault secrets persist for server lifetime), #28 (V1.1 decision: per-request vs decrypt-once)

## Problem

`createAgentContext` (`packages/core/src/mcp/context.ts`) decrypts the agent vault
once at server startup and holds every private key, API key, and RPC URL in a
closure for the lifetime of the process. The design doc promises the opposite:
"vault opens, secret extracted, operation performed, secret wiped, vault locks."

## What the fix is actually worth

Issue #10 states the impact as "if the server is compromised after startup, all
keys are available in memory." Per-request decryption does not fix that, and the
spec should not claim it does.

`server.ts:48` reads the vault key from `process.env.CHAINVAULT_VAULT_KEY`. That
variable lives in the process environment for the whole session — reachable from
the heap, from `/proc/<pid>/environ`, and from any accidental `process.env` dump.
An attacker who can read host memory therefore already holds the key that
decrypts the vault file, whether or not the plaintext secrets are also resident.

Two benefits survive that scrutiny, and they are the justification for the work:

1. **Instant revocation and rotation.** `rotateAgentKey`, `regenerateAgent`, and
   `revokeAgent` (`vault/agent-vault.ts`) each mint a new vault key or delete the
   file. Under decrypt-once, a running server keeps serving a revoked agent until
   it reconnects. Re-reading the file per call means revocation lands immediately.
2. **A smaller accident surface.** Plaintext key material is resident for
   milliseconds rather than hours, which meaningfully reduces what a heap dump,
   core dump, swap page, or crash reporter can capture. This is protection against
   leakage, not against an active attacker.

## Decision

Refactor to per-request decryption, **and** drop the vault key from the process
environment after init. Shipping the refactor without the second half would leave
a hardening claim the architecture does not support.

## Design

### AgentContext shape

Split by whether the value is a secret.

Snapshotted at init (unchanged, synchronous):

- `agentName`, `config`, `rules`, `keys` (public addresses only)

This is safe because no mutation path preserves a valid key: every permission
change re-keys the vault, and revocation deletes it. A still-decryptable vault
file therefore always carries the config it had at init.

Re-read per call (now `async`, returning a Promise):

- `getPrivateKeyForChain(chainId)`
- `getApiKey(serviceName)`
- `getApiKeyForExplorer(explorerApiUrl)`
- `getRpcUrlForChain(chainId)`

`getRpcUrlForChain` is included deliberately. Infura and Alchemy URLs embed the
API key in the path, so an RPC URL is a credential, not configuration.

### openVault()

A private helper reads the vault file, decrypts it with the retained key buffer,
parses it through `AgentVaultDataSchema`, and returns `AgentVaultData`. Each
accessor calls it, extracts the single field it needs, and returns that field —
the rest of the structure becomes unreachable when the call returns.

Only the 32-byte key buffer persists between calls.

### listApiServices()

New accessor returning `{ name, baseUrl }[]`. Base URLs are not secrets.

This exists to fix an ordering problem in `query_explorer` and `verify_contract`:
both currently resolve the API key first and check `checkApiRequest` second, which
inverts the project's "rules before decryption" invariant. With the service name
available without touching a key, both tools can check rules first and pull the
secret only after approval.

### Fail-closed behaviour

When the vault file no longer decrypts — rotated, regenerated, or deleted —
`openVault()` throws `VaultUnavailableError`. Every secret accessor propagates it;
every tool handler catches it and returns a denial naming the cause, audited as
`denied`.

The server process stays up rather than exiting, so the operator sees a clear
sequence of denials instead of an unexplained disconnect. No tool can succeed in
this state, because every tool that does real work needs either a key or an RPC URL.

### Process environment and lifecycle

`ChainVaultServer.init()` deletes `process.env.CHAINVAULT_VAULT_KEY` after
building the context. Node's `delete` unsets the variable in the real OS
environment, so `/proc/<pid>/environ` no longer carries it.

`ChainVaultServer` has no `close()` today. This design adds one: it wipes the key
buffer via the existing `wipeBuffer` and closes the `ChainVaultDB` handle, which
is currently left open for the process lifetime.

### Documentation

SECURITY.md gains a "Secrets in memory" section stating plainly:

- what the design achieves: short plaintext residency, immediate revocation
- what it does not: a host-memory attacker holding the vault key can decrypt the
  file directly; JS strings are immutable, so `params.privateKey = ''` in
  `evm-adapter.ts` removes a reference and does not zero the bytes

## Testing

- `openVault` is called per accessor invocation, not once (spy on `readFile`)
- rotating the vault key mid-session makes the next secret access fail closed
- deleting the vault file mid-session makes the next secret access fail closed
- `config`, `rules`, and `keys` keep working from the init snapshot
- `process.env.CHAINVAULT_VAULT_KEY` is absent after `init()`
- `close()` wipes the key buffer and later secret access fails closed
- tools return an audited denial, not a crash, on `VaultUnavailableError`
- existing `context.test.ts` cases keep passing with `await`

The anvil workstyle tier already exercises deploy and write end to end through a
real vault, so it covers the refactor without new integration scaffolding.

## Compatibility

`createAgentContext` is exported from `@chainvault/core`, so turning four
accessors async is technically a breaking change to a public symbol. It is
undocumented server plumbing with no known external consumer, so this ships as
**1.2.0** with an explicit CHANGELOG note rather than a major bump.

## Out of scope

- A TTL cache over the decrypted vault. The file read is already cheap next to
  chain latency; a cache would add invalidation logic and weaken the revocation
  guarantee that motivates the change.
- Charging gas against spend limits for `interact_contract` (see #13B notes).
- Replacing the env-var handoff with a socket or prompt-based key delivery. That
  would close the remaining gap and deserves its own issue.
