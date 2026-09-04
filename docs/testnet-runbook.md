# Testnet Tier Runbook

The `testnet` vitest project runs a live smoke on Sepolia. It is nightly/manual
only and never gates PRs.

## Key provisioning
1. Generate a dedicated throwaway key (`chainvault key generate testnet-ci` or `cast wallet new`).
   NEVER reuse a key holding real funds.
2. Fund it with ~0.05 Sepolia ETH via the faucets registered in the chain
   registry (`list_supported_chains` shows them): Google Cloud faucet,
   pk910 PoW faucet, or Alchemy faucet.
3. Locally: put the vars in `.env` (see `.env.example`) or inline:
   `TESTNET_PRIVATE_KEY=0x... npm run test:testnet`. The `0x` prefix is
   optional — a raw 64-hex key is accepted and normalized.
   CI: set the `TESTNET_PRIVATE_KEY` repo secret (and optionally
   `ETHERSCAN_API_KEY` for the verify_contract and query_explorer tests).

The `ETHERSCAN_API_KEY` is a single Etherscan V2 key that works across every
supported chain via the unified endpoint (`https://api.etherscan.io/v2/api`);
the per-chain V1 hosts (api-sepolia.etherscan.io, ...) are deprecated.

## Cost & limits
- The fixture caps the agent at 0.005 ETH/tx and 0.01 ETH/day; a full run
  costs well under 0.01 Sepolia ETH in gas.
- The suite preflights the balance and skips (with a warning) below 0.02 ETH.

## When the nightly skips or fails
- "holds < 0.02 ETH" warning → top up via a faucet, re-dispatch the workflow.
- RPC flake → re-run; PublicNode Sepolia is best-effort.
- Repeated verify_contract failures → check Etherscan API status and the key's rate limit.
