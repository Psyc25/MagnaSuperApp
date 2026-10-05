import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * Route ini memakai service role (melewati RLS), jadi WAJIB dibatasi ke akun
 * akses penuh -- tanpa pengecekan ini siapa pun di internet bisa memanggilnya
 * dan membaca pesan error database mentah.
 */
async function requireFullAccess(): Promise<NextResponse | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.division !== "all") {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 403 });
  }
  return null;
}

export async function POST() {
  const denied = await requireFullAccess();
  if (denied) return denied;
  try {
    const supabase = createAdminClient();

    // Create table
    const { error: tableError } = await supabase.rpc("exec", {
      query: `
        CREATE TABLE IF NOT EXISTS ai_assistant_messages (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          role text NOT NULL CHECK (role IN ('user', 'assistant')),
          content text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `,
    });

    if (tableError && !tableError.message.includes("already exists")) {
      // Try direct approach if RPC doesn't exist
      // Create by inserting and deleting a test row
      const { error: testError } = await supabase
        .from("ai_assistant_messages")
        .select("id")
        .limit(1);

      if (testError?.code === "42P01") {
        // Table doesn't exist - we need manual migration
        return NextResponse.json({
          success: false,
          message: "Tabel belum ada. Silakan jalankan SQL migrasi di Supabase Dashboard.",
          sql: `
CREATE TABLE IF NOT EXISTS ai_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_assistant_messages_user_created_idx
  ON ai_assistant_messages (user_id, created_at);

ALTER TABLE ai_assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_assistant_messages_select ON ai_assistant_messages;
DROP POLICY IF EXISTS ai_assistant_messages_insert ON ai_assistant_messages;
DROP POLICY IF EXISTS ai_assistant_messages_delete ON ai_assistant_messages;

CREATE POLICY ai_assistant_messages_select ON ai_assistant_messages
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ai_assistant_messages_insert ON ai_assistant_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_assistant_messages_delete ON ai_assistant_messages
  FOR DELETE USING (user_id = auth.uid());
          `.trim(),
        });
      }
    }

    // Check if table exists now
    const { error: checkError } = await supabase
      .from("ai_assistant_messages")
      .select("id")
      .limit(1);

    if (checkError) {
      return NextResponse.json({
        success: false,
        error: checkError.message,
      });
    }

    return NextResponse.json({
      success: true,
      message: "AI Assistant table ready!",
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function GET() {
  const denied = await requireFullAccess();
  if (denied) return denied;
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("ai_assistant_messages")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json({
        exists: false,
        error: error.message,
      });
    }

    return NextResponse.json({
      exists: true,
      message: "Table exists",
    });
  } catch (err) {
    return NextResponse.json({
      exists: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
