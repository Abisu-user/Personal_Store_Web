import type { PersistedBackgroundSaveJob } from "@/lib/background-save/types";

const DATABASE_NAME = "personal-store-background-save-v1";
const STORE_NAME = "jobs";
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function listPersistedBackgroundSaveJobs(userId: string) {
  const database = await openDatabase();
  if (!database) return [] as PersistedBackgroundSaveJob[];

  return new Promise<PersistedBackgroundSaveJob[]>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("userId");
    const request = index.getAll(userId);
    request.onerror = () => resolve([]);
    request.onsuccess = () => resolve((request.result ?? []) as PersistedBackgroundSaveJob[]);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function persistBackgroundSaveJob(job: PersistedBackgroundSaveJob) {
  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(job);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
  database.close();
}

export async function removePersistedBackgroundSaveJob(id: string) {
  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
  database.close();
}

export async function clearPersistedBackgroundSaveJobs(userId: string) {
  const jobs = await listPersistedBackgroundSaveJobs(userId);
  await Promise.all(jobs.map((job) => removePersistedBackgroundSaveJob(job.id)));
}
