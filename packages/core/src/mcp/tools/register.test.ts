import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './register.js';

describe('registerTool wrapper', () => {
  it('forwards name, definition, and handler to server.registerTool unchanged', () => {
    const registerToolSpy = vi.fn();
    const fakeServer = { registerTool: registerToolSpy } as unknown as McpServer;
    const def = {
      title: 'My Tool',
      description: 'Does a thing',
      inputSchema: z.object({ x: z.number() }),
    };
    const handler = async () => ({ content: [{ type: 'text' as const, text: 'ok' }] });

    registerTool(fakeServer, 'my_tool', def, handler);

    expect(registerToolSpy).toHaveBeenCalledTimes(1);
    expect(registerToolSpy).toHaveBeenCalledWith('my_tool', def, handler);
  });

  it('invokes the handler with parsed args when the tool is called', async () => {
    let received: unknown;
    const fakeServer = {
      registerTool: (_name: string, _def: unknown, handler: (a: unknown) => unknown) => {
        received = handler;
      },
    } as unknown as McpServer;

    const handler = async ({ chain_id }: { chain_id: number }) => ({
      content: [{ type: 'text' as const, text: String(chain_id) }],
    });

    registerTool(
      fakeServer,
      'echo',
      { title: 'Echo', description: 'echo', inputSchema: z.object({ chain_id: z.number() }) },
      handler,
    );

    const result = await (received as typeof handler)({ chain_id: 42 });
    expect(result.content[0].text).toBe('42');
  });
});
