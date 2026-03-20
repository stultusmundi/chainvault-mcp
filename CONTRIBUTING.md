# Contributing to ChainVault MCP

Thank you for your interest in contributing to ChainVault MCP. This guide will help you get started.

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Development Setup

**Requirements:** Node.js 20+, npm 10+

```bash
git clone https://github.com/stultusmundi/chainvault-mcp.git
cd chainvault-mcp
npm install
npm run build
npx vitest run        # run all tests (427 tests)
npx tsc --noEmit      # type check
```

## Project Structure

Monorepo with npm workspaces. Two packages:

- **`packages/core`** -- MCP server, vault encryption, rules engine, chain adapters, API proxy, audit logger
- **`packages/cli`** -- Interactive TUI (Ink/React) and direct CLI commands (Commander)

See [`CLAUDE.md`](CLAUDE.md) for project-wide conventions and [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md) for core module boundaries and encryption standards.

## Testing

We use [vitest](https://vitest.dev/) with a TDD workflow.

- Test files live next to source: `foo.ts` -> `foo.test.ts`
- Run a single test file: `npx vitest run path/to/file.test.ts`
- Run all tests: `npx vitest run`
- Watch mode: `npx vitest`

**Rules:**

- Write failing tests first, then implement
- Mock external services (RPCs, APIs) -- tests must work offline
- Test both success and failure paths, especially for security-related code
- Use temp directories (`mkdtemp`) for vault/file tests, clean up in `afterEach`

## Commit Conventions

Concise, imperative mood, under 72 characters.

**Format:** `<prefix>(<scope>): <description>`

**Prefixes:** `feat`, `fix`, `test`, `docs`, `chore`, `refactor`

**Scopes:** `vault`, `rules`, `chain`, `proxy`, `mcp`, `cli`, `tui`, `audit`

**Examples:**

```
feat(vault): add key rotation
fix(rules): enforce monthly spend limit correctly
test(chain): add EvmAdapter write operation tests
docs: update README quick start section
```

## Pull Request Process

1. Branch from `main` with a descriptive branch name (e.g., `feat/solana-adapter`, `fix/daily-limit-reset`)
2. Make your changes following the conventions above
3. Ensure all tests pass (`npx vitest run`) and types check (`npx tsc --noEmit`)
4. Write a clear PR title and description. Link any related issues.
5. Request review from a maintainer

## What's Welcome

- Bug fixes with regression tests
- Test coverage improvements
- New chain adapters implementing the `ChainAdapter` interface
- New MCP tools with Zod-validated inputs
- Documentation improvements
- Performance optimizations with benchmarks

## What's NOT Welcome

- **Changes that weaken security invariants.** Private keys must never be logged, returned, or persisted in plaintext. Rules engine must always run before vault decryption. No exceptions.
- **New dependencies without discussion.** Open an issue first to discuss the need and evaluate alternatives.
- **Large refactors without an issue first.** Propose the change, get alignment, then implement.
- **Skipping tests.** Every public function needs tests. No `.todo` or `.skip` without a linked issue.

## AI-Assisted Contributions

Contributions that use AI-assisted code generation (Copilot, Claude, ChatGPT, etc.) are welcome, but must be disclosed in the PR description. All submitted code must be reviewed and understood by the contributor. You are responsible for the correctness, security, and quality of anything you submit, regardless of how it was generated.

## Security

If you discover a security vulnerability, **do not open a public issue.** Please follow our [Security Policy](SECURITY.md) and report via GitHub Security Advisories.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
