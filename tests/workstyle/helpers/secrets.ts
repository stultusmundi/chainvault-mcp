import { expect } from 'vitest';

/** Recursively collect every string in a JSON-ish structure (incl. Error messages and Error.cause). */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value instanceof Error) {
    out.push(value.message, value.stack ?? '');
    if ((value as any).cause) collectStrings((value as any).cause, out);
  }
  else if (value instanceof Map) {
    value.forEach((v, k) => {
      if (typeof k === 'string') out.push(k);
      collectStrings(v, out);
    });
  }
  else if (value instanceof Set) {
    value.forEach((v) => collectStrings(v, out));
  }
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
