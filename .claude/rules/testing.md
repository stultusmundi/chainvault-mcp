---
paths:
  - "**/*.test.ts"
---

# Testing Rules

- Follow TDD: write failing test → verify failure → implement → verify pass
- Run the specific test file first, then full suite before committing
- Use `describe`/`it` blocks with descriptive names that read as specifications
- Create temp directories for any file-based tests, clean up in `afterEach`
- Mock external services (RPCs, APIs) — tests must work offline
- Test both success and failure paths (especially for security-related code)
- Never skip or `.todo` tests — if it's worth writing, it's worth finishing
