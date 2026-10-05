"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { BoothProject, BoothStatus, MaterialItem, PurchaseOrder } from "@/lib/production/types";
import type { Client } from "@/lib/magnative/types";
import { ACTIVE_BOOTH_STATUSES, getAvailableStock } from "@/lib/production/availability";
import * as actions from "@/lib/production/actions";
import type { MutationResult, NewBoothProjectInput, SaveBoothProjectResult } from "@/lib/production/actions";

type ProductionDataContextValue = {
  materials: MaterialItem[];
  projects: BoothProject[];
  /** Daftar klien terdaftar di Magnative — dipakai picker "Klien Terdaftar" di form proyek booth (migrasi 0010). */
  clients: Client[];
  purchaseOrders: PurchaseOrder[];

  addMaterial: (input: Omit<MaterialItem, "id">) => Promise<MutationResult>;
  updateMaterial: (id: string, input: Omit<MaterialItem, "id">, expectedStock?: number) => Promise<MutationResult>;
  deleteMaterial: (id: string) => Promise<MutationResult>;
  getActiveProjectsForMaterial: (materialId: string) => BoothProject[];
  getAvailableStockFor: (materialId: string, excludeProjectId?: string) => number;

  addProject: (input: NewBoothProjectInput) => Promise<SaveBoothProjectResult>;
  updateProject: (id: string, input: NewBoothProjectInput) => Promise<SaveBoothProjectResult>;
  deleteProject: (id: string) => Promise<MutationResult>;
  updateProjectStatus: (id: string, status: BoothStatus, fromStatus?: BoothStatus) => Promise<MutationResult>;

  addPurchaseOrder: (input: Omit<PurchaseOrder, "id" | "status" | "receivedDate">) => Promise<MutationResult>;
  receivePurchaseOrder: (id: string) => Promise<MutationResult>;
  cancelPurchaseOrder: (id: string) => Promise<MutationResult>;
  deletePurchaseOrder: (id: string) => Promise<MutationResult>;
};

const ProductionDataContext = createContext<ProductionDataContextValue | null>(null);

/**
 * Sumber data modul Production (material gudang + proyek booth) —
 * SEKARANG datanya datang dari Supabase, di-fetch di
 * `src/app/dashboard/production/layout.tsx` (Server Component) dan
 * diteruskan lewat props. Pola persis sama dengan `MagnarentDataProvider`/
 * `MagnativeDataProvider`: tidak ada state duplikat, tiap mutasi memanggil
 * Server Action di `src/lib/production/actions.ts` yang `revalidatePath`
 * setelah menulis ke DB.
 */
export function ProductionDataProvider({
  materials,
  projects,
  clients,
  purchaseOrders,
  children,
}: {
  materials: MaterialItem[];
  projects: BoothProject[];
  clients: Client[];
  purchaseOrders: PurchaseOrder[];
  children: ReactNode;
}) {
  const addMaterial = useCallback((input: Omit<MaterialItem, "id">) => actions.addMaterial(input), []);
  const updateMaterial = useCallback(
    (id: string, input: Omit<MaterialItem, "id">, expectedStock?: number) =>
      actions.updateMaterial(id, input, expectedStock),
    []
  );
  const deleteMaterial = useCallback((id: string) => actions.deleteMaterial(id), []);

  const addProject = useCallback((input: NewBoothProjectInput) => actions.addProject(input), []);
  const updateProject = useCallback(
    (id: string, input: NewBoothProjectInput) => actions.updateProject(id, input),
    []
  );
  const deleteProject = useCallback((id: string) => actions.deleteProject(id), []);
  const updateProjectStatus = useCallback(
    (id: string, status: BoothStatus, fromStatus?: BoothStatus) => actions.updateProjectStatus(id, status, fromStatus),
    []
  );

  /** Dipakai UI untuk memblokir hapus material yang masih dialokasikan proyek aktif. */
  const getActiveProjectsForMaterial = useCallback(
    (materialId: string) =>
      projects.filter(
        (p) => ACTIVE_BOOTH_STATUSES.includes(p.status) && p.materials.some((m) => m.materialId === materialId)
      ),
    [projects]
  );

  const getAvailableStockFor = useCallback(
    (materialId: string, excludeProjectId?: string) => {
      const material = materials.find((m) => m.id === materialId);
      if (!material) return 0;
      return getAvailableStock(material, projects, excludeProjectId);
    },
    [materials, projects]
  );

  const addPurchaseOrder = useCallback(
    (input: Omit<PurchaseOrder, "id" | "status" | "receivedDate">) => actions.addPurchaseOrder(input),
    []
  );
  const receivePurchaseOrder = useCallback((id: string) => actions.receivePurchaseOrder(id), []);
  const cancelPurchaseOrder = useCallback((id: string) => actions.cancelPurchaseOrder(id), []);
  const deletePurchaseOrder = useCallback((id: string) => actions.deletePurchaseOrder(id), []);

  const value = useMemo<ProductionDataContextValue>(
    () => ({
      materials,
      projects,
      clients,
      purchaseOrders,
      addMaterial,
      updateMaterial,
      deleteMaterial,
      getActiveProjectsForMaterial,
      getAvailableStockFor,
      addProject,
      updateProject,
      deleteProject,
      updateProjectStatus,
      addPurchaseOrder,
      receivePurchaseOrder,
      cancelPurchaseOrder,
      deletePurchaseOrder,
    }),
    [
      materials,
      projects,
      clients,
      purchaseOrders,
      addMaterial,
      updateMaterial,
      deleteMaterial,
      getActiveProjectsForMaterial,
      getAvailableStockFor,
      addProject,
      updateProject,
      deleteProject,
      updateProjectStatus,
      addPurchaseOrder,
      receivePurchaseOrder,
      cancelPurchaseOrder,
      deletePurchaseOrder,
    ]
  );

  return <ProductionDataContext.Provider value={value}>{children}</ProductionDataContext.Provider>;
}

export function useProductionData(): ProductionDataContextValue {
  const ctx = useContext(ProductionDataContext);
  if (!ctx) {
    throw new Error("useProductionData harus dipakai di dalam <ProductionDataProvider>");
  }
  return ctx;
}
