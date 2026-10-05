/**
 * TypeScript types untuk AI tool calling system.
 */

export type UserContext = {
  userId: string;
  userName: string;
  division: string;
  canAccessMagnarent: boolean;
  canAccessMagnative: boolean;
  canAccessProduction: boolean;
  canAccessEvents: boolean;
  canAccessAdmin: boolean;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Jika true, aksi butuh konfirmasi user sebelum dieksekusi */
  requiresConfirmation?: boolean;
  /** Pesan konfirmasi yang ditampilkan ke user */
  confirmationMessage?: string;
  /** Data aksi yang akan dieksekusi setelah konfirmasi */
  pendingAction?: PendingAction;
};

export type PendingAction = {
  tool: string;
  args: Record<string, unknown>;
  description: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};
