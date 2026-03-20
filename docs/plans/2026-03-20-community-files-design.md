# Community Files & README Overhaul — Design Document

**Date:** 2026-03-20
**Status:** Approved
**Author:** Vasilis Magkoutis

## 1. Overview

Create professional community files modeled on high-star repos (viem, Foundry, MCP servers). Rewrite README for star-attracting quality. Add CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, and GitHub templates.

## 2. Files

| File | Action | Model |
|------|--------|-------|
| `README.md` | Rewrite | viem/Foundry patterns — badges, architecture, before/after, quick start |
| `CONTRIBUTING.md` | Create | viem/Foundry — dev setup, PR process, AI disclosure policy |
| `CODE_OF_CONDUCT.md` | Create | Contributor Covenant v2.1 |
| `SECURITY.md` | Create | Vault-focused, GitHub Security Advisories only |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Create | YAML form, component dropdown |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Create | Problem/solution format |
| `.github/ISSUE_TEMPLATE/config.yml` | Create | Route questions to Discussions |
| `.github/pull_request_template.md` | Create | Description + checklist |
| `.github/CODEOWNERS` | Create | Route reviews |

## 3. README Structure

1. Tagline + badges (npm, CI, license, tests)
2. One-paragraph pitch
3. Architecture diagram (existing)
4. "Why ChainVault?" before/after table (existing)
5. Quick Start (install → init → add key → create agent → MCP config)
6. Supported Chains table (14 chains, faucet indicators)
7. MCP Tool Reference (19 tools)
8. TUI section
9. Security Model (condensed threat table)
10. Contributing link
11. License

## 4. SECURITY.md — GitHub Security Advisories

No email needed. Report via GitHub Security Advisories. Scope covers vault encryption bypass, key/secret exposure, rules engine circumvention, injection attacks.

## 5. CONTRIBUTING.md — AI Disclosure Policy

Following Foundry's precedent: AI-assisted contributions must be disclosed in the PR description. All code must be reviewed and understood by the submitter.
