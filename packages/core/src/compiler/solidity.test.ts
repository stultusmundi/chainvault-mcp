import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecFile,
}));

import { buildStandardInput, parseOutput, resolveCompiler, compile } from './solidity.js';
import type { CompileResult, CompilerMethod } from './solidity.js';

const SOLC_SUCCESS_OUTPUT = JSON.stringify({
  contracts: {
    'Contract.sol': {
      Counter: {
        abi: [{ type: 'function', name: 'increment', inputs: [], outputs: [], stateMutability: 'nonpayable' }],
        evm: { bytecode: { object: '608060405234801561001057600080fd5b50' } },
      },
    },
  },
  errors: [{ severity: 'warning', formattedMessage: 'SPDX license identifier not provided' }],
});

describe('buildStandardInput', () => {
  it('generates valid solc standard-json with source and default optimizer settings', () => {
    const source = 'pragma solidity ^0.8.0; contract Counter {}';
    const result = JSON.parse(buildStandardInput(source));

    expect(result.language).toBe('Solidity');
    expect(result.sources['Contract.sol'].content).toBe(source);
    expect(result.settings.optimizer.enabled).toBe(false);
    expect(result.settings.optimizer.runs).toBe(200);
    expect(result.settings.outputSelection['*']['*']).toContain('abi');
    expect(result.settings.outputSelection['*']['*']).toContain('evm.bytecode');
  });

  it('generates standard-json with optimizer enabled and custom runs', () => {
    const source = 'pragma solidity ^0.8.0; contract Counter {}';
    const result = JSON.parse(buildStandardInput(source, true, 1000));

    expect(result.settings.optimizer.enabled).toBe(true);
    expect(result.settings.optimizer.runs).toBe(1000);
  });
});

describe('parseOutput', () => {
  it('extracts abi, bytecode, and warnings from successful compilation', () => {
    const result: CompileResult = parseOutput(SOLC_SUCCESS_OUTPUT, 'Counter');

    expect(result.abi).toEqual([
      { type: 'function', name: 'increment', inputs: [], outputs: [], stateMutability: 'nonpayable' },
    ]);
    expect(result.bytecode).toBe('0x608060405234801561001057600080fd5b50');
    expect(result.warnings).toEqual(['SPDX license identifier not provided']);
  });

  it('throws on compilation errors', () => {
    const errorOutput = JSON.stringify({
      contracts: {},
      errors: [
        { severity: 'error', formattedMessage: 'ParserError: Expected pragma' },
      ],
    });

    expect(() => parseOutput(errorOutput, 'Counter')).toThrow('ParserError: Expected pragma');
  });

  it('throws if contract not found in output', () => {
    const output = JSON.stringify({
      contracts: {
        'Contract.sol': {
          Other: {
            abi: [],
            evm: { bytecode: { object: 'aabb' } },
          },
        },
      },
      errors: [],
    });

    expect(() => parseOutput(output, 'Counter')).toThrow('Counter');
  });
});

describe('resolveCompiler', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('prefers docker when available', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: 'Docker info output', stderr: '' });

    const method: CompilerMethod = await resolveCompiler('0.8.24');

    expect(method.type).toBe('docker');
    expect(method.version).toBe('0.8.24');
    expect(mockExecFile).toHaveBeenCalledWith('docker', ['info']);
  });

  it('falls back to local solc with version match', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('docker not found'));
    mockExecFile.mockResolvedValueOnce({
      stdout: 'solc, the solidity compiler commandline interface\nVersion: 0.8.24+commit.abcdef',
      stderr: '',
    });

    const method: CompilerMethod = await resolveCompiler('0.8.24');

    expect(method.type).toBe('local');
    expect(method.version).toBe('0.8.24');
  });

  it('errors on version mismatch with local solc', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('docker not found'));
    mockExecFile.mockResolvedValueOnce({
      stdout: 'solc, the solidity compiler commandline interface\nVersion: 0.8.20+commit.abcdef',
      stderr: '',
    });

    await expect(resolveCompiler('0.8.24')).rejects.toThrow('version mismatch');
  });

  it('errors when nothing found', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('docker not found'));
    mockExecFile.mockRejectedValueOnce(new Error('solc not found'));

    await expect(resolveCompiler('0.8.24')).rejects.toThrow();
  });
});

describe('compile', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('compiles using docker when available', async () => {
    // resolveCompiler: docker info succeeds
    mockExecFile.mockResolvedValueOnce({ stdout: 'Docker info', stderr: '' });
    // compile: docker run solc
    mockExecFile.mockResolvedValueOnce({ stdout: SOLC_SUCCESS_OUTPUT, stderr: '' });

    const result = await compile(
      'pragma solidity ^0.8.24; contract Counter {}',
      '0.8.24',
      'Counter',
    );

    expect(result.abi).toHaveLength(1);
    expect(result.bytecode).toMatch(/^0x/);
    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      ['run', '--rm', '-i', 'ethereum/solc:0.8.24', '--standard-json'],
      expect.objectContaining({ input: expect.any(String) }),
    );
  });

  it('compiles using local solc as fallback', async () => {
    // resolveCompiler: docker fails, local solc succeeds
    mockExecFile.mockRejectedValueOnce(new Error('docker not found'));
    mockExecFile.mockResolvedValueOnce({
      stdout: 'Version: 0.8.24+commit.abc',
      stderr: '',
    });
    // compile: local solc
    mockExecFile.mockResolvedValueOnce({ stdout: SOLC_SUCCESS_OUTPUT, stderr: '' });

    const result = await compile(
      'pragma solidity ^0.8.24; contract Counter {}',
      '0.8.24',
      'Counter',
    );

    expect(result.abi).toHaveLength(1);
    expect(mockExecFile).toHaveBeenCalledWith(
      'solc',
      ['--standard-json'],
      expect.objectContaining({ input: expect.any(String) }),
    );
  });
});
