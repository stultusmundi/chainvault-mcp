/**
 * Minimal type declarations for @anthropic-ai/claude-code SDK.
 *
 * The package ships as a bundled CLI without exported .d.ts files.
 * These declarations cover only the subset used by the e2e test scripts.
 */
declare module '@anthropic-ai/claude-code' {
  export interface StdioMcpServer {
    type: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }

  export interface QueryOptions {
    maxTurns?: number;
    allowedTools?: string[];
    mcpServers?: Record<string, StdioMcpServer>;
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
    systemPrompt?: string;
    cwd?: string;
  }

  export interface TextBlock {
    type: 'text';
    text: string;
  }

  export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: unknown;
  }

  export type ContentBlock = TextBlock | ToolUseBlock;

  export interface MessagePayload {
    content: ContentBlock[];
  }

  /**
   * Messages streamed from the SDK. The `type` field discriminates between
   * assistant turns, final results, and other lifecycle events.
   */
  export interface SDKMessage {
    type: string;
    message: MessagePayload;
    [key: string]: unknown;
  }

  export function query(params: {
    prompt: string;
    options?: QueryOptions;
  }): AsyncIterable<SDKMessage>;
}
