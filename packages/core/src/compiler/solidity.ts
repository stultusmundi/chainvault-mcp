import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

export interface CompileResult {
  abi: any[];
  bytecode: string;
  warnings: string[];
}

export interface CompilerMethod {
  type: 'docker' | 'local';
  version: string;
}

export function buildStandardInput(
  source: string,
  optimization: boolean = false,
  optimizationRuns: number = 200,
): string {
  return JSON.stringify({
    language: 'Solidity',
    sources: {
      'Contract.sol': { content: source },
    },
    settings: {
      optimizer: {
        enabled: optimization,
        runs: optimizationRuns,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  });
}

export function parseOutput(rawOutput: string, contractName: string): CompileResult {
  const output = JSON.parse(rawOutput);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (output.errors) {
    for (const err of output.errors) {
      if (err.severity === 'error') {
        errors.push(err.formattedMessage);
      } else {
        warnings.push(err.formattedMessage);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.join('\n')}`);
  }

  // Search for the contract across all source files
  const contracts = output.contracts ?? {};
  for (const sourceFile of Object.keys(contracts)) {
    const fileContracts = contracts[sourceFile];
    if (fileContracts[contractName]) {
      const contract = fileContracts[contractName];
      return {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
        warnings,
      };
    }
  }

  throw new Error(`Contract "${contractName}" not found in compilation output`);
}

export async function resolveCompiler(version: string): Promise<CompilerMethod> {
  // Try docker first
  try {
    await execFileAsync('docker', ['info']);
    return { type: 'docker', version };
  } catch {
    // Docker not available, try local solc
  }

  try {
    const { stdout } = await execFileAsync('solc', ['--version']);
    const match = stdout.match(/Version:\s*(\d+\.\d+\.\d+)/);
    if (match) {
      const localVersion = match[1];
      if (localVersion !== version) {
        throw new Error(
          `Local solc version mismatch: expected ${version}, found ${localVersion}`,
        );
      }
      return { type: 'local', version };
    }
    throw new Error('Could not parse solc version from output');
  } catch (err) {
    if (err instanceof Error && err.message.includes('version mismatch')) {
      throw err;
    }
    throw new Error(
      `No Solidity compiler found. Install Docker or solc ${version}.`,
    );
  }
}

export async function compile(
  source: string,
  version: string,
  contractName: string,
  optimization: boolean = false,
  optimizationRuns: number = 200,
): Promise<CompileResult> {
  const compiler = await resolveCompiler(version);
  const input = buildStandardInput(source, optimization, optimizationRuns);

  let stdout: string;

  if (compiler.type === 'docker') {
    const result = await execFileAsync(
      'docker',
      ['run', '--rm', '-i', 'ethereum/solc:' + version, '--standard-json'],
      { input },
    );
    stdout = result.stdout;
  } else {
    const result = await execFileAsync('solc', ['--standard-json'], { input });
    stdout = result.stdout;
  }

  return parseOutput(stdout, contractName);
}
