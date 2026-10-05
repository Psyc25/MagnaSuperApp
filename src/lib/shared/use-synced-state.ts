import { useState, type Dispatch, type SetStateAction } from "react";

const UNSET = Symbol("unset");

/**
 * State lokal yang mengikuti prop dari server, tapi tetap bisa diubah lokal
 * (mis. update optimistis) sampai prop-nya berubah lagi -- biasanya setelah
 * `router.refresh()`/`revalidatePath` mengirim data baru.
 *
 * Pengganti pola `useEffect(() => setX(prop), [prop])`: dengan effect, React
 * sempat merender data LAMA sekali lalu render ulang (cascading render).
 * Di sini perbedaannya dideteksi saat render dan state disesuaikan sebelum
 * apa pun tampil -- pola resmi React "adjusting state when a prop changes"
 * (react.dev/learn/you-might-not-need-an-effect).
 */
export function useSyncedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(source);
  const [prevSource, setPrevSource] = useState(source);
  if (!Object.is(source, prevSource)) {
    setPrevSource(source);
    setState(source);
  }
  return [state, setState];
}

/**
 * Jalankan `reset` (berisi setState milik komponen pemanggil) setiap kali
 * `key` berubah, termasuk saat pertama render -- dipakai untuk mengisi ulang
 * form setiap kali modal dibuka (`key` = `open ? idYangDiedit : null`).
 *
 * Pengganti `useEffect(() => { if (!open) return; setForm(...) }, [open])`
 * dengan alasan yang sama seperti `useSyncedState` di atas: form langsung
 * terisi di render pertama modal terbuka, tanpa sekilas menampilkan isi
 * lama lalu render ulang.
 */
export function useResetOnChange<K>(key: K, reset: (key: K) => void): void {
  const [prevKey, setPrevKey] = useState<K | typeof UNSET>(UNSET);
  if (!Object.is(prevKey, key)) {
    setPrevKey(key);
    reset(key);
  }
}
