import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

export async function pullSolc(version: string = '0.8.20'): Promise<string> {
  const image = `ethereum/solc:${version}`;
  console.log(`Pulling Docker image: ${image}...`);

  try {
    await execFileAsync('docker', ['pull', image], { timeout: 120000 });
    return `Successfully pulled ${image}. The compile_contract tool is now ready.`;
  } catch (err: any) {
    if (err.message?.includes('ENOENT') || err.message?.includes('not found')) {
      throw new Error('Docker is not installed. Install Docker from https://docker.com or install solc locally.');
    }
    throw new Error(`Failed to pull ${image}: ${err.message}`);
  }
}
