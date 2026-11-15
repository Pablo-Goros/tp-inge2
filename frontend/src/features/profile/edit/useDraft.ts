import type { Profile } from '../../../api';

const key = (owner: string) => `pe-draft:${owner}`;
export interface StoredDraft { at: number; profile: Profile }

export function readDraft(owner: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(key(owner));
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch { return null; }
}
export function writeDraft(owner: string, profile: Profile) {
  try { localStorage.setItem(key(owner), JSON.stringify({ at: Date.now(), profile })); } catch { /* sin storage o cuota */ }
}
export function clearDraft(owner: string) {
  try { localStorage.removeItem(key(owner)); } catch { /* nada */ }
}
