/**
 * Minimal type declarations for @anthropic-ai/claude-agent-sdk.
 *
 * These declarations cover only the subset used by the e2e test scripts.
 */
declare module '@anthropic-ai/claude-agent-sdk' {
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

  export interface SDKAssistantMessage {
    type: 'assistant';
    uuid: string;
    session_id: string;
    message: { content: ContentBlock[] };
    parent_tool_use_id: string | null;
  }

  export interface SDKResultMessage {
    type: 'result';
    subtype: string;
    uuid: string;
    session_id: string;
    result?: string;
    is_error: boolean;
    num_turns: number;
    total_cost_usd: number;
  }

  export interface SDKSystemMessage {
    type: 'system';
    subtype: 'init';
    uuid: string;
    session_id: string;
    tools: string[];
    model: string;
  }

  export type SDKMessage = SDKAssistantMessage | SDKResultMessage | SDKSystemMessage | {
    type: string;
    [key: string]: unknown;
  };

  export interface Query extends AsyncGenerator<SDKMessage, void> {
    abort(): void;
  }

  export function query(params: {
    prompt: string;
    options?: QueryOptions;
  }): Query;
}
