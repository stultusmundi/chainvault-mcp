import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * A tool definition as accepted by the MCP SDK's `registerTool`.
 * `inputSchema` is a Zod object; its inferred output types the handler args.
 */
interface ToolDefinition<Schema extends z.AnyZodObject> {
  title: string;
  description: string;
  inputSchema: Schema;
}

/**
 * Typed wrapper over `McpServer.registerTool`.
 *
 * The SDK's `registerTool` is generic over the tool's Zod schema and infers the
 * handler's argument type from it. With our schemas that inference recurses
 * without bound (`TS2589: Type instantiation is excessively deep`) and makes
 * `tsc` consume >8 GB and crash — which is why the project's type-check was
 * disabled and became vacuous (issue #33).
 *
 * We do the inference ourselves — `z.infer<Schema>` is a single, bounded
 * instantiation of our own object schema — and hand the SDK an already-typed
 * callback through one contained cast. The SDK's runaway generic is never
 * instantiated. Runtime behavior is identical to calling `server.registerTool`
 * directly; only the type-level cost changes.
 *
 * Every MCP tool registration MUST go through this wrapper rather than calling
 * `server.registerTool` directly, or the type-check will OOM again.
 */
export function registerTool<Schema extends z.AnyZodObject>(
  server: McpServer,
  name: string,
  definition: ToolDefinition<Schema>,
  handler: (args: z.infer<Schema>) => Promise<CallToolResult>,
): void {
  const untyped = server as unknown as {
    registerTool: (
      name: string,
      definition: unknown,
      handler: unknown,
    ) => unknown;
  };
  untyped.registerTool(name, definition, handler);
}
