import { describe, it, expect, vi } from 'vitest';

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: mockExecFile }));
vi.mock('node:util', () => ({ promisify: () => mockExecFile }));

import { pullSolc } from './solc.js';

describe('pullSolc', () => {
  it('rejects a non-semver version before invoking docker', async () => {
    for (const bad of ['latest', '-v', '0.8', '0.8.24; echo pwned', 'ethereum/solc@sha256:abcd']) {
      await expect(pullSolc(bad)).rejects.toThrow(/invalid solc version/i);
    }
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('invokes docker pull for a well-formed version', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    const msg = await pullSolc('0.8.24');
    expect(msg).toMatch(/ethereum\/solc:0\.8\.24/);
    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      ['pull', 'ethereum/solc:0.8.24'],
      expect.anything(),
    );
  });
});
