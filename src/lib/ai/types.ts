/**
 * TypeScript types untuk AI tool calling system.
 */

// Multimodal content types for vision support
export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };
export type MessageContent = string | (TextContent | ImageContent)[];

// Attachment for AI messages
export type AIAttachment = {
  type: "image";
  url: string; // base64 data URL
  name?: string;
};

export type UserContext = {
  userId: string;
  userName: string;
  division: string;
  canAccessMagnarent: boolean;
  canAccessMagnative: boolean;
  canAccessProduction: boolean;
  /** Lihat daftar event (RLS `events_select`: 3 divisi + finance + akses penuh). */
  canAccessEvents: boolean;
  /** Lihat item checklist (RLS `event_checklist_items_select`: 3 divisi + akses penuh). */
  canAccessChecklist: boolean;
  /** Catat Realisasi Event (RLS `event_expenses_access`: semua kecuali investor). */
  canAccessExpenses: boolean;
  canAccessAdmin: boolean;
  /** Faktur & piutang (RLS `invoices_select`: akses penuh, investor, finance). */
  canAccessInvoices: boolean;
  /** Pengajuan modal (RLS `capital_requests_select`: akses penuh, investor). */
  canAccessCapital: boolean;
  /** Purchase order Production (RLS: divisi production/akses penuh, investor). */
  canAccessPurchaseOrders: boolean;
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
  content: MessageContent; // string or multimodal array
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};
