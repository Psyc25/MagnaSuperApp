import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDivision } from "@/lib/push/notify";
import { todayISO } from "@/lib/shared/utils";
import {
  computeEndDue,
  computeStartDue,
  endBody,
  endTitle,
  startBody,
  startTitle,
  type EventDateNotificationRow,
} from "@/lib/events/date-notifications";
import type { EventStatus } from "@/lib/events/types";

export const runtime = "nodejs";

type EventRow = {
  id: string;
  name: string;
  client_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: EventStatus;
  start_notified_at: string | null;
  end_notified_at: string | null;
};

const TRACKING_PATH = "/dashboard/tracking-event";

/**
 * Gap yang ditemukan Claude saat QC event "GRAB MODIS" (6 Okt 2026, atas
 * permintaan Owner): dulu TIDAK ADA notifikasi otomatis saat event MULAI
 * (start_date tiba) atau SELESAI (end_date lewat) -- cuma "Event Baru" saat
 * dibuat & milestone loading (lihat `createEvent` / milestone loading di
 * lib/events/actions.ts), tidak satupun berbasis tanggal. Pola auth
 * CRON_SECRET & service role SAMA PERSIS dengan `/api/cron/invoice-reminders`
 * (lihat komentar di sana untuk alasannya).
 *
 * Idempotent lewat kolom `start_notified_at`/`end_notified_at` (migrasi
 * 0097_event_start_end_notifications), BUKAN cocok-hari-H seperti
 * `computeDueReminders` -- lihat komentar lib/events/date-notifications.ts.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("events")
    .select("id, name, client_name, start_date, end_date, status, start_notified_at, end_notified_at")
    .or("start_notified_at.is.null,end_notified_at.is.null")
    .returns<EventRow[]>();

  if (error) {
    console.error("[cron] event-date-notifications: ambil data event gagal:", error.message);
    return NextResponse.json({ error: "Gagal ambil data event" }, { status: 500 });
  }

  const events: EventDateNotificationRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    clientName: r.client_name,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    startNotifiedAt: r.start_notified_at,
    endNotifiedAt: r.end_notified_at,
  }));

  const today = todayISO();
  const startDue = computeStartDue(events, today);
  const endDue = computeEndDue(events, today);

  // Satu per satu (bukan Promise.all) -- pola sama dengan cron lain di
  // folder ini -- supaya notifyDivision & update kolom `*_notified_at`
  // selalu sepasang per event, tanpa race antar event yang saling tunggu.
  for (const e of startDue) {
    await notifyDivision(["magnarent", "magnative", "production"], {
      title: startTitle(),
      body: startBody(e),
      url: `${TRACKING_PATH}/${e.id}`,
      important: true,
    });
    await admin.from("events").update({ start_notified_at: new Date().toISOString() }).eq("id", e.id);
  }

  for (const e of endDue) {
    await notifyDivision(["magnarent", "magnative", "production"], {
      title: endTitle(),
      body: endBody(e),
      url: `${TRACKING_PATH}/${e.id}`,
      important: true,
    });
    await admin.from("events").update({ end_notified_at: new Date().toISOString() }).eq("id", e.id);
  }

  return NextResponse.json({
    ok: true,
    checked: events.length,
    startNotified: startDue.length,
    endNotified: endDue.length,
  });
}
