import { createInterface } from 'node:readline';

/**
 * Prompt user for input. Hides input when `hidden` is true (for secrets).
 */
export function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    if (hidden) {
      // Mute output for secret input
      process.stderr.write(question);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(true);

      let input = '';
      const onData = (char: Buffer) => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener('data', onData);
          process.stderr.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          // Ctrl+C
          process.exit(1);
        } else if (c === '\u007F' || c === '\b') {
          // Backspace
          input = input.slice(0, -1);
        } else {
          input += c;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Get vault password from env or prompt interactively.
 */
export async function getPassword(): Promise<string> {
  const envPassword = process.env.CHAINVAULT_PASSWORD;
  if (envPassword) return envPassword;
  return prompt('Vault password: ', true);
}
