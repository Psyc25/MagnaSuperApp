-- Hasil Supabase performance advisor (QC 5 Okt 2026):
--
-- 1. unindexed_foreign_keys (0001): 29 foreign key tanpa index penutup.
--    Tanpa index, JOIN/filter ke kolom ini dan setiap DELETE di tabel
--    induk (cek ON DELETE) memindai seluruh tabel anak. Index ditambahkan
--    dengan nama <tabel>_<kolom>_idx. Murni aditif, tidak mengubah data.
--
-- 2. auth_rls_initplan (0003): 10 policy memanggil auth.uid()/auth.role()
--    per BARIS. Dibungkus (select ...) supaya Postgres menghitungnya sekali
--    per query (initPlan). Arti policy tidak berubah sama sekali -- ALTER
--    POLICY hanya mengganti ekspresinya.
--
-- 3. handle_new_user() dan protect_privileged_profile_columns() adalah
--    fungsi TRIGGER; tidak pernah sah dipanggil lewat /rest/v1/rpc. Hak
--    EXECUTE untuk role API dicabut (advisor 0029). Trigger tetap jalan:
--    Postgres tidak mengecek hak EXECUTE saat trigger dipicu.

create index if not exists client_portal_links_created_by_idx on public.client_portal_links (created_by);
create index if not exists document_signatures_created_by_idx on public.document_signatures (created_by);
create index if not exists document_signatures_portal_link_id_idx on public.document_signatures (portal_link_id);
create index if not exists event_checklist_items_completed_by_idx on public.event_checklist_items (completed_by);
create index if not exists event_checklist_items_created_by_idx on public.event_checklist_items (created_by);
create index if not exists event_checklist_items_finished_by_idx on public.event_checklist_items (finished_by);
create index if not exists event_checklist_items_loading_in_by_idx on public.event_checklist_items (loading_in_by);
create index if not exists event_checklist_items_loading_out_by_idx on public.event_checklist_items (loading_out_by);
create index if not exists event_checklist_items_pic_idx on public.event_checklist_items (pic);
create index if not exists event_checklist_items_pic_lapangan_idx on public.event_checklist_items (pic_lapangan);
create index if not exists event_checklist_items_production_done_by_idx on public.event_checklist_items (production_done_by);
create index if not exists event_checklist_items_vendor_id_idx on public.event_checklist_items (vendor_id);
create index if not exists event_checklist_phase_reviews_approved_by_idx on public.event_checklist_phase_reviews (approved_by);
create index if not exists event_checklist_phase_reviews_submitted_by_idx on public.event_checklist_phase_reviews (submitted_by);
create index if not exists event_checklist_status_log_pic_idx on public.event_checklist_status_log (pic);
create index if not exists event_links_created_by_idx on public.event_links (created_by);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists events_event_type_id_idx on public.events (event_type_id);
create index if not exists journal_entries_created_by_idx on public.journal_entries (created_by);
create index if not exists magnarent_warehouse_transfers_from_warehouse_id_idx on public.magnarent_warehouse_transfers (from_warehouse_id);
create index if not exists magnarent_warehouse_transfers_to_warehouse_id_idx on public.magnarent_warehouse_transfers (to_warehouse_id);
create index if not exists magnative_pipeline_files_uploaded_by_idx on public.magnative_pipeline_files (uploaded_by);
create index if not exists magnative_project_tasks_pic_idx on public.magnative_project_tasks (pic);
create index if not exists magnative_project_tasks_vendor_id_idx on public.magnative_project_tasks (vendor_id);
create index if not exists notification_reads_user_id_idx on public.notification_reads (user_id);
create index if not exists notifications_created_by_idx on public.notifications (created_by);
create index if not exists production_material_transfers_created_by_idx on public.production_material_transfers (created_by);
create index if not exists production_project_documents_uploaded_by_idx on public.production_project_documents (uploaded_by);
create index if not exists production_purchase_orders_vendor_id_idx on public.production_purchase_orders (vendor_id);

alter policy ai_assistant_messages_select_own on public.ai_assistant_messages
  using (user_id = (select auth.uid()));
alter policy ai_assistant_messages_insert_own on public.ai_assistant_messages
  with check (user_id = (select auth.uid()));
alter policy ai_assistant_messages_delete_own on public.ai_assistant_messages
  using (user_id = (select auth.uid()));
alter policy ai_assistant_messages_update_own on public.ai_assistant_messages
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "staff_full_access_portal_links" on public.client_portal_links
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');
alter policy "staff_full_access_signatures" on public.document_signatures
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

alter policy "notifications_read" on public.notifications
  using (
    (select public.current_user_has_full_access())
    or (select public.current_user_division()) = any (target_divisions)
    or (select auth.uid()) = any (target_user_ids)
  );
alter policy "notification_reads_select_own" on public.notification_reads
  using ((select auth.uid()) = user_id);
alter policy "notification_reads_insert_own" on public.notification_reads
  with check ((select auth.uid()) = user_id);
alter policy "notification_reads_delete_own" on public.notification_reads
  using ((select auth.uid()) = user_id);

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_privileged_profile_columns() from public, anon, authenticated;
