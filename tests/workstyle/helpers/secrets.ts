import { expect } from 'vitest';

/** Recursively collect every string in a JSON-ish structure (incl. Error messages). */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value instanceof Error) out.push(value.message, value.stack ?? '');
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

/**
 * Assert no string anywhere in `value` contains any secret — checked
 * case-insensitively, with and without a 0x prefix.
 */
export function assertNoSecrets(value: unknown, secrets: string[]): void {
  const variants = secrets.flatMap((s) => {
    const bare = s.startsWith('0x') ? s.slice(2) : s;
    return [s.toLowerCase(), bare.toLowerCase()];
  });
  for (const str of collectStrings(value)) {
    const lower = str.toLowerCase();
    for (const secret of variants) {
      expect(lower, `secret material leaked in: ${str.slice(0, 120)}`).not.toContain(secret);
    }
  }
}
