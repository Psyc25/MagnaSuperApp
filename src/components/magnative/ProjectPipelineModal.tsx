"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { File as FileIcon, Trash2, UploadCloud } from "lucide-react";
import { useMagnativeData } from "./MagnativeDataProvider";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { formatDateID } from "@/lib/shared/utils";
import { prepareUploadFiles } from "@/lib/shared/image";
import { PIPELINE_STAGES, type PipelineFile, type PipelineStage, type Project } from "@/lib/magnative/types";

const GRADIENT = "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)";

const STAGE_LABELS: Record<PipelineStage, string> = {
  Invitation: "Invitation",
  Briefing: "Briefing",
  Submit: "Submit",
  Present: "Present",
};

/**
 * Modal "Pipeline Proposal" (rekomendasi 2 laporan gap-event vs SOP, migrasi
 * 0064) — mendigitalkan tahap SEBELUM keputusan menang/kalah (papan tulis
 * Owner: Invitation -> Briefing -> Submit -> Present) yang sebelumnya SAMA
 * SEKALI tidak tercatat di sistem manapun. Pola modal & upload sama persis
 * dengan `ProjectVendorModal`/`CreativeAssetGallery` (FormData + upload-lalu-
 * insert). Upload file bebas format + catatan singkat per tahap (disetujui
 * Owner lewat pertanyaan klarifikasi), bukan field terstruktur terpisah per
 * jenis dokumen (MOM/rekaman/draft) — staf unggah PDF/Word/PPT/audio dll di
 * satu tempat yang sama, fleksibel untuk semua jenis dokumen.
 */
export function ProjectPipelineModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { projects, getPipelineFilesForProject, updateProjectPipelineStage, uploadPipelineFile, deletePipelineFile } =
    useMagnativeData();
  const { showToast } = useToast();

  // `project` adalah snapshot dari saat modal dibuka (state `pipelineTarget`
  // di ProjectManager.tsx) -- untuk `pipelineStage` yang bisa berubah lewat
  // modal ini sendiri, ambil versi terbaru dari context (sudah otomatis
  // ter-update lewat `revalidatePath` setelah `updateProjectPipelineStage`)
  // supaya dropdown "Tahap Saat Ini" tidak menampilkan nilai basi.
  const liveProject = projects.find((p) => p.id === project.id) ?? project;

  const files = getPipelineFilesForProject(project.id);
  const filesByStage = useMemo(() => {
    const map = new Map<PipelineStage, PipelineFile[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage, []);
    for (const f of files) map.get(f.stage)?.push(f);
    return map;
  }, [files]);

  const [stageUpdating, setStageUpdating] = useState(false);
  const [uploadStage, setUploadStage] = useState<PipelineStage>(project.pipelineStage ?? "Invitation");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PipelineFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleStageChange(stage: PipelineStage | "") {
    setStageUpdating(true);
    const result = await updateProjectPipelineStage(project.id, stage || null);
    setStageUpdating(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(stage ? `Tahap pipeline diubah ke "${stage}".` : "Tahap pipeline dikosongkan.");
  }

  async function handleUploadSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Pilih file terlebih dahulu.");
      return;
    }

    // File pipeline (draft/final karya) tidak dikompres, cuma dicek ukurannya.
    const prepared = await prepareUploadFiles([file], { compress: false });
    if (!prepared.ok) {
      setError(prepared.error);
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("projectId", project.id);
    formData.set("stage", uploadStage);
    formData.set("notes", notes.trim());

    setSubmitting(true);
    const result = await uploadPipelineFile(formData);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(`File berhasil diunggah ke tahap "${uploadStage}".`);
    setNotes("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const result = await deletePipelineFile(deleteTarget.id);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`File "${deleteTarget.fileName}" berhasil dihapus.`);
    setDeleteTarget(null);
  }

  return (
    <Modal open onClose={onClose} title={`Pipeline Proposal — ${project.name}`}>
      <div className="space-y-4">
        <div>
          <label htmlFor="pipeline-stage" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Tahap Saat Ini
          </label>
          <select
            id="pipeline-stage"
            value={liveProject.pipelineStage ?? ""}
            onChange={(e) => handleStageChange(e.target.value as PipelineStage | "")}
            disabled={stageUpdating}
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 disabled:opacity-60 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
          >
            <option value="">— Belum mulai —</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            Hanya relevan selagi status proyek &quot;Pitching&quot; — riwayat file di bawah tetap tersimpan
            setelah proyek menang/kalah.
          </p>
        </div>

        <form onSubmit={handleUploadSubmit} className="space-y-3 rounded-xl border border-dashed border-violet-300 p-3 dark:border-violet-500/40">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Unggah File (MOM/rekaman/draft proposal, dll)</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="pipeline-upload-stage" className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                Tahap
              </label>
              <select
                id="pipeline-upload-stage"
                value={uploadStage}
                onChange={(e) => setUploadStage(e.target.value as PipelineStage)}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pipeline-file" className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                File
              </label>
              <input
                id="pipeline-file"
                ref={fileInputRef}
                type="file"
                className="w-full rounded-lg border border-black/10 bg-transparent text-xs text-zinc-900 outline-none file:mr-2 file:rounded-full file:border-0 file:bg-zinc-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-600 dark:border-white/10 dark:text-white dark:file:bg-white/10 dark:file:text-zinc-200"
              />
            </div>
          </div>
          <div>
            <label htmlFor="pipeline-notes" className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
              Catatan (opsional)
            </label>
            <input
              id="pipeline-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. hasil MOM meeting briefing 20 Sep"
              className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: GRADIENT }}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            {submitting ? "Mengunggah…" : "Unggah File"}
          </button>
        </form>

        <div className="max-h-72 space-y-3 overflow-y-auto">
          {PIPELINE_STAGES.map((stage) => {
            const stageFiles = filesByStage.get(stage) ?? [];
            return (
              <div key={stage}>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {STAGE_LABELS[stage]} ({stageFiles.length})
                </p>
                {stageFiles.length === 0 ? (
                  <EmptyState icon={FileIcon} title="Belum ada file" description={`Belum ada file diunggah untuk tahap ${stage}.`} />
                ) : (
                  <ul className="divide-y divide-black/5 rounded-xl border border-black/5 dark:divide-white/5 dark:border-white/10">
                    {stageFiles.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <a
                            href={f.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-sm font-medium text-violet-600 hover:underline dark:text-violet-300"
                          >
                            {f.fileName}
                          </a>
                          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {f.notes ? `${f.notes} · ` : ""}
                            {formatDateID(f.createdAt.slice(0, 10))}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          disabled={busyId === f.id}
                          title="Hapus file"
                          aria-label="Hapus file"
                          className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>


      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus File Pipeline"
        description={
          deleteTarget && (
            <>
              Yakin hapus file <strong>{deleteTarget.fileName}</strong>? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />
    </Modal>
  );
}
