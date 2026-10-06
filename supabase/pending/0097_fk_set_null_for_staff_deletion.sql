-- STATUS: BELUM DITERAPKAN (menunggu persetujuan Owner). Sudah diuji di
-- database hasil rebuild.
--
-- Hapus akun staf (auth.admin.deleteUser) ditolak 9 foreign key NO ACTION
-- ke profiles/auth.users -- staf yang pernah mengisi checklist event atau
-- membuat link portal klien tidak bisa dihapus. Sejak commit "staf yang
-- tidak bisa dihapus kini dinonaktifkan" akun seperti itu di-ban sebagai
-- gantinya; migrasi ini membuat hapus permanen juga bisa: kolom "oleh
-- siapa" dikosongkan, riwayatnya tetap ada.
--
-- Pesan chat staf yang dihapus juga tidak lagi ikut terhapus (dulu ON DELETE
-- CASCADE menghapus seluruh riwayat chat orang itu); sender_name sudah
-- tersimpan di baris pesan untuk tampilan.
alter table client_portal_links drop constraint client_portal_links_created_by_fkey, add constraint client_portal_links_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table document_signatures drop constraint document_signatures_created_by_fkey, add constraint document_signatures_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table event_checklist_items drop constraint event_checklist_items_completed_by_fkey, add constraint event_checklist_items_completed_by_fkey foreign key (completed_by) references profiles(id) on delete set null;
alter table event_checklist_items drop constraint event_checklist_items_finished_by_fkey, add constraint event_checklist_items_finished_by_fkey foreign key (finished_by) references profiles(id) on delete set null;
alter table event_checklist_items drop constraint event_checklist_items_loading_in_by_fkey, add constraint event_checklist_items_loading_in_by_fkey foreign key (loading_in_by) references profiles(id) on delete set null;
alter table event_checklist_items drop constraint event_checklist_items_loading_out_by_fkey, add constraint event_checklist_items_loading_out_by_fkey foreign key (loading_out_by) references profiles(id) on delete set null;
alter table event_checklist_items drop constraint event_checklist_items_production_done_by_fkey, add constraint event_checklist_items_production_done_by_fkey foreign key (production_done_by) references profiles(id) on delete set null;
alter table event_checklist_phase_reviews drop constraint event_checklist_phase_reviews_approved_by_fkey, add constraint event_checklist_phase_reviews_approved_by_fkey foreign key (approved_by) references profiles(id) on delete set null;
alter table event_checklist_phase_reviews drop constraint event_checklist_phase_reviews_submitted_by_fkey, add constraint event_checklist_phase_reviews_submitted_by_fkey foreign key (submitted_by) references profiles(id) on delete set null;

alter table public.chat_messages
  alter column sender_id drop not null,
  drop constraint chat_messages_sender_id_fkey,
  add constraint chat_messages_sender_id_fkey foreign key (sender_id) references auth.users(id) on delete set null;
