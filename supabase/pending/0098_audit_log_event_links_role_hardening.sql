-- STATUS: BELUM DITERAPKAN (menunggu persetujuan Owner). Sudah diuji di
-- database hasil rebuild.
--
-- 1. activity_log: insert hanya mensyaratkan "sudah login", sehingga user
--    mana pun (termasuk investor) bisa menyisipkan entri audit atas nama
--    orang lain lewat PostgREST. Kini actor_id wajib = pemanggil
--    (logActivity di src/lib/activity/log.ts memang selalu mengirim user.id).
-- 2. event_links: staf divisi mana pun bisa mengaitkan booking/proyek DIVISI
--    LAIN ke event, yang lewat current_user_can_view_linked_source() membuka
--    baca baris itu (budget, DP, dst). Kini hanya sumber milik divisinya
--    (akses penuh tetap boleh semua).
-- 3. Policy tabel Production & komentar checklist yang masih untuk role
--    public (termasuk anon) dibatasi ke authenticated. Celah anon-nya sudah
--    tertutup oleh current_user_division() -> 'none' (migrasi 0094); ini
--    lapisan pengaman kedua.
alter policy "activity_log_insert_any_authenticated" on public.activity_log
  with check (actor_id = (select auth.uid()));

alter policy "event_links_insert" on public.event_links
  with check (
    case source_type
      when 'magnarent_booking' then public.can_access_division('magnarent')
      when 'magnative_project' then public.can_access_division('magnative')
      when 'production_booth_project' then public.can_access_division('production')
      else false
    end
  );

alter policy event_checklist_comments_access on public.event_checklist_comments to authenticated;
alter policy production_bom_templates_delete on public.production_bom_templates to authenticated;
alter policy production_bom_templates_insert on public.production_bom_templates to authenticated;
alter policy production_bom_templates_select on public.production_bom_templates to authenticated;
alter policy production_bom_templates_update on public.production_bom_templates to authenticated;
alter policy production_crew_piece_payments_access on public.production_crew_piece_payments to authenticated;
alter policy production_crew_timelogs_access on public.production_crew_timelogs to authenticated;
alter policy production_material_transfers_insert on public.production_material_transfers to authenticated;
alter policy production_material_transfers_select on public.production_material_transfers to authenticated;
alter policy production_nc_reports_access on public.production_nc_reports to authenticated;
alter policy production_project_documents_access on public.production_project_documents to authenticated;
alter policy production_subcontract_orders_access on public.production_subcontract_orders to authenticated;
alter policy production_vendors_delete on public.production_vendors to authenticated;
alter policy production_vendors_insert on public.production_vendors to authenticated;
alter policy production_vendors_select on public.production_vendors to authenticated;
alter policy production_vendors_update on public.production_vendors to authenticated;
