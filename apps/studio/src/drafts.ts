import type { Draft } from "./model.js";

export type SaveStatus = "saving" | "saved" | "error";
export interface DraftDatabase {
  list(): Promise<Draft[]>;
  revisions(id: string): Promise<Draft[]>;
  put(draft: Draft): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = "smartphonecracy-studio";
const request = <T>(value: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });

export class IndexedDbDraftDatabase implements DraftDatabase {
  private db = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("drafts", { keyPath: "key" });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });

  private async values(): Promise<Array<{ key: string; draft: Draft }>> {
    const db = await this.db;
    return request(db.transaction("drafts").objectStore("drafts").getAll());
  }
  async list() {
    return (await this.values())
      .filter(({ key }) => key.endsWith(":latest"))
      .map(({ draft }) => draft)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async revisions(id: string) {
    return (await this.values())
      .filter(({ key }) => key.startsWith(`${id}:revision:`))
      .map(({ draft }) => draft)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async put(draft: Draft) {
    const db = await this.db;
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    store.put({ key: `${draft.id}:latest`, draft });
    store.put({ key: `${draft.id}:revision:${draft.updatedAt}`, draft });
    const old = await this.revisions(draft.id);
    old.slice(19).forEach((item) => store.delete(`${draft.id}:revision:${item.updatedAt}`));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async delete(id: string) {
    const db = await this.db;
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    for (const { key } of await this.values()) if (key.startsWith(`${id}:`)) store.delete(key);
  }
}

export class Autosave {
  status: SaveStatus = "saved";
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private db: DraftDatabase, private delayMs = 500) {}
  schedule(draft: Draft, changed?: (status: SaveStatus) => void) {
    clearTimeout(this.timer);
    this.status = "saving";
    changed?.(this.status);
    this.timer = setTimeout(async () => {
      try {
        await this.db.put(draft);
        this.status = "saved";
      } catch {
        this.status = "error";
      }
      changed?.(this.status);
    }, this.delayMs);
  }
}

export async function recoverDraft(db: DraftDatabase, id: string): Promise<Draft | undefined> {
  const candidates = [...(await db.list()).filter((draft) => draft.id === id), ...(await db.revisions(id))];
  return candidates.find((draft) =>
    draft?.project?.scenario?.phases?.length > 0 && draft.document?.studioFormatVersion === 1,
  );
}
