// Your clips, kept in this browser (IndexedDB). Nothing is uploaded anywhere.
import type { Look } from "./render";
import type { Zoom } from "./zoom";

export type Clip = {
  id: string;
  name: string;
  created: number;
  updated: number;
  blob: Blob;
  duration: number;
  width: number;
  height: number;
  zooms: Zoom[];
  analyzed: boolean;
  look: Look;
  trim: [number, number];
  example?: boolean;
  thumb?: string;
};
export type ClipMeta = Omit<Clip, "blob">;

const DB = "pushin", STORE = "clips";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { resolve(r.result); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
    t.onabort = () => { reject(t.error ?? new Error("The browser refused to save (storage full?)")); db.close(); };
  });
}

export const saveClip = (c: Clip) => tx("readwrite", (s) => s.put(c)).then(() => undefined);
export const getClip = (id: string) => tx<Clip | undefined>("readonly", (s) => s.get(id));
export const deleteClip = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => undefined);
export async function listClips(): Promise<ClipMeta[]> {
  const all = await tx<Clip[]>("readonly", (s) => s.getAll());
  return all.map(({ blob: _b, ...m }) => m).sort((a, b) => b.updated - a.updated);
}

// The last look you used, so the next clip starts the way you like it.
const LOOK_KEY = "pushin.look";
export function lastLook(): Look | null {
  try { const v = localStorage.getItem(LOOK_KEY); return v ? (JSON.parse(v) as Look) : null; } catch { return null; }
}
export function rememberLook(l: Look) { try { localStorage.setItem(LOOK_KEY, JSON.stringify(l)); } catch { /* private mode */ } }
