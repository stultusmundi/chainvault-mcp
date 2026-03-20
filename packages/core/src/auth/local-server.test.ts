import { describe, it, expect, afterEach } from 'vitest';
import { AuthLocalServer } from './local-server.js';

describe('AuthLocalServer', () => {
  let server: AuthLocalServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('starts on a random port', async () => {
    server = new AuthLocalServer();
    const port = await server.start();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it('returns a URL', async () => {
    server = new AuthLocalServer();
    const port = await server.start();
    expect(server.getUrl('register')).toBe(`http://127.0.0.1:${port}/register`);
  });

  it('stops cleanly', async () => {
    server = new AuthLocalServer();
    await server.start();
    await server.stop();
    server = null;
  });
});
