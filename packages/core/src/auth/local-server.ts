import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { registrationPage, authenticationPage } from './pages.js';
import { WebAuthnManager } from './webauthn-server.js';

export class AuthLocalServer {
  private server: Server | null = null;
  private port = 0;
  private callbackResolve: ((data: unknown) => void) | null = null;
  private callbackReject: ((err: Error) => void) | null = null;
  private webauthn = new WebAuthnManager();

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      this.server.on('error', reject);
    });
  }

  getUrl(path: string): string {
    return `http://127.0.0.1:${this.port}/${path}`;
  }

  waitForCallback(timeoutMs = 120000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.callbackResolve = resolve;
      this.callbackReject = reject;
      const timer = setTimeout(() => {
        this.callbackResolve = null;
        this.callbackReject = null;
        reject(new Error('WebAuthn callback timed out'));
      }, timeoutMs);
      // Keep reference to clear on resolve
      const origResolve = this.callbackResolve;
      this.callbackResolve = (data: unknown) => {
        clearTimeout(timer);
        resolve(data);
      };
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/register') {
      const options = this.webauthn.generateRegistrationOptions();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(registrationPage(options as unknown as Record<string, unknown>));
      return;
    }

    if (method === 'GET' && url === '/auth') {
      // For authentication, we need a credential ID — use a placeholder
      const options = this.webauthn.generateAuthenticationOptions('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(authenticationPage(options as unknown as Record<string, unknown>));
      return;
    }

    if (method === 'POST' && url === '/callback') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          if (this.callbackResolve) {
            this.callbackResolve(data);
            this.callbackResolve = null;
            this.callbackReject = null;
          }
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}
