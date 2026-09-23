"use client";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import {
  listPersistedBackgroundSaveJobs,
  persistBackgroundSaveJob,
  removePersistedBackgroundSaveJob,
} from "@/lib/background-save/persistence";
import type {
  BackgroundSaveJob,
  BackgroundSaveRequest,
  EnqueueBackgroundSave,
} from "@/lib/background-save/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./background-save.module.css";

type RuntimeJob = EnqueueBackgroundSave & { request?: BackgroundSaveRequest; maxRetries: number };
type SaveContextValue = {
  jobs: BackgroundSaveJob[];
  enqueue: (input: EnqueueBackgroundSave) => string;
  retry: (id: string) => void;
  open: () => void;
};

class SaveRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SaveRequestError";
    this.status = status;
  }
}

const BackgroundSaveContext = createContext<SaveContextValue | null>(null);
const MAX_CONCURRENT_SAVES = 3;
const REQUEST_TIMEOUT_MS = 45_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeBody(previous: unknown, next: unknown) {
  return isPlainObject(previous) && isPlainObject(next) ? { ...previous, ...next } : next;
}

function canPersist(input: EnqueueBackgroundSave) {
  return Boolean(
    input.persist &&
      input.sensitive === false &&
      input.request &&
      (input.request.method === "PATCH" || input.request.method === "PUT"),
  );
}

function safeHeaders(headers?: Record<string, string>) {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !["authorization", "cookie"].includes(key.toLowerCase())),
  );
}

function iconForType(type: string): AppIconName {
  if (type.includes("anime")) return "anime";
  if (type.includes("bookmark")) return "bookmark";
  if (type.includes("note")) return "note";
  if (type.includes("photo")) return "photo";
  if (type.includes("file")) return "file";
  if (type.includes("code")) return "code";
  return "storage";
}

function stateText(job: BackgroundSaveJob) {
  if (job.status === "queued") return "等待儲存";
  if (job.status === "saving") return "儲存中";
  if (job.status === "retrying") return "準備重試";
  if (job.status === "offline") return "離線等待";
  if (job.status === "failed") return "儲存失敗";
  return "已儲存";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "儲存失敗，請稍後再試。";
}

export function BackgroundSaveProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [jobs, setJobs] = useState<BackgroundSaveJob[]>([]);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [panelOpen, setPanelOpen] = useState(false);
  const jobsRef = useRef(jobs);
  const runtimeJobs = useRef(new Map<string, RuntimeJob>());
  const activeEntities = useRef(new Set<string>());
  const activeCount = useRef(0);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const patchJob = useCallback((id: string, patch: Partial<BackgroundSaveJob>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job)));
  }, []);

  const persistIfNeeded = useCallback(
    (job: BackgroundSaveJob, runtime: RuntimeJob) => {
      if (!job.persist || !runtime.request) return;
      void persistBackgroundSaveJob({
        ...job,
        userId,
        request: { ...runtime.request, headers: safeHeaders(runtime.request.headers) },
        maxRetries: runtime.maxRetries,
      });
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    void listPersistedBackgroundSaveJobs(userId).then((persisted) => {
      if (cancelled || persisted.length === 0) return;
      const restored = persisted.map((item) => ({
        ...item,
        status: (navigator.onLine ? "queued" : "offline") as BackgroundSaveJob["status"],
        error: undefined,
        readyAt: Date.now(),
      }));
      restored.forEach((item) => {
        runtimeJobs.current.set(item.id, { request: item.request, maxRetries: item.maxRetries, type: item.type, title: item.title });
      });
      setJobs((current) => [...restored.filter((item) => !current.some((job) => job.id === item.id)), ...current]);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setJobs((current) => current.map((job) => (job.status === "offline" ? { ...job, status: "queued", readyAt: Date.now() } : job)));
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const executeJob = useCallback(
    async (job: BackgroundSaveJob) => {
      const runtime = runtimeJobs.current.get(job.id);
      if (!runtime) return;
      const entityKey = job.entityKey ?? job.id;
      activeCount.current += 1;
      activeEntities.current.add(entityKey);
      patchJob(job.id, { status: "saving", error: undefined });

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        let result: unknown;
        const reportProgress = (progress: number | undefined, label?: string) => {
          patchJob(job.id, { progress, progressLabel: label });
        };
        if (runtime.execute) {
          result = await runtime.execute({ signal: controller.signal, reportProgress });
        } else if (runtime.request) {
          const response = await fetch(runtime.request.url, {
            method: runtime.request.method,
            credentials: "include",
            headers: { "Content-Type": "application/json", ...runtime.request.headers },
            body: runtime.request.body === undefined ? undefined : JSON.stringify(runtime.request.body),
            signal: controller.signal,
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            const message = isPlainObject(payload) && typeof payload.error === "string" ? payload.error : `儲存失敗（${response.status}）`;
            throw new SaveRequestError(message, response.status);
          }
          result = payload;
        } else {
          throw new SaveRequestError("背景儲存工作缺少執行內容。");
        }

        setJobs((current) => {
          const completed = current.map((item) => item.id === job.id ? { ...item, status: "saved" as const, progress: 100, progressLabel: undefined, updatedAt: Date.now() } : item);
          let savedCount = 0;
          return completed.filter((item) => item.status !== "saved" || savedCount++ < 10);
        });
        void removePersistedBackgroundSaveJob(job.id);
        await runtime.onSuccess?.(result);
      } catch (unknownError) {
        const error = unknownError instanceof Error ? unknownError : new Error(getErrorMessage(unknownError));
        const latest = jobsRef.current.find((item) => item.id === job.id) ?? job;
        const status = error instanceof SaveRequestError ? error.status : undefined;
        const retriable = !online || status === 429 || (typeof status === "number" && status >= 500) || error.name === "AbortError" || status === undefined;
        const nextRetryCount = latest.retryCount + 1;

        if (!navigator.onLine) {
          const offlineJob = { ...latest, status: "offline" as const, error: "目前離線，連線後會自動重試。", retryCount: nextRetryCount };
          patchJob(job.id, offlineJob);
          persistIfNeeded(offlineJob, runtime);
        } else if (retriable && nextRetryCount <= runtime.maxRetries) {
          const retryJob = {
            ...latest,
            status: "retrying" as const,
            retryCount: nextRetryCount,
            readyAt: Date.now() + 800 * 2 ** (nextRetryCount - 1),
            error: getErrorMessage(error),
          };
          patchJob(job.id, retryJob);
          persistIfNeeded(retryJob, runtime);
        } else {
          patchJob(job.id, { status: "failed", retryCount: nextRetryCount, error: getErrorMessage(error) });
          if (runtime.rollbackOnFailure !== false) await runtime.rollback?.();
          await runtime.onError?.(error);
          setPanelOpen(true);
        }
      } finally {
        window.clearTimeout(timeout);
        activeCount.current -= 1;
        activeEntities.current.delete(entityKey);
        setJobs((current) => [...current]);
      }
    },
    [online, patchJob, persistIfNeeded],
  );

  useEffect(() => {
    if (!online || activeCount.current >= MAX_CONCURRENT_SAVES) return;
    const now = Date.now();
    const candidates = jobs.filter(
      (job) =>
        (job.status === "queued" || job.status === "retrying") &&
        job.readyAt <= now &&
        !activeEntities.current.has(job.entityKey ?? job.id),
    );
    const available = Math.max(0, MAX_CONCURRENT_SAVES - activeCount.current);
    candidates.slice(0, available).forEach((job) => void executeJob(job));
    const nextReadyAt = jobs
      .filter((job) => (job.status === "queued" || job.status === "retrying") && job.readyAt > now)
      .reduce<number | null>((soonest, job) => (soonest === null || job.readyAt < soonest ? job.readyAt : soonest), null);
    if (nextReadyAt === null) return;
    const timer = window.setTimeout(() => setJobs((current) => [...current]), Math.max(20, nextReadyAt - now));
    return () => window.clearTimeout(timer);
  }, [executeJob, jobs, online]);

  const enqueue = useCallback(
    (input: EnqueueBackgroundSave) => {
      if (!input.request && !input.execute) throw new Error("背景儲存工作必須提供 request 或 execute。");
      const now = Date.now();
      const existing = input.mergeKey
        ? jobsRef.current.find(
            (job) => job.mergeKey === input.mergeKey && ["queued", "retrying", "offline"].includes(job.status),
          )
        : undefined;

      if (existing) {
        const runtime = runtimeJobs.current.get(existing.id);
        if (runtime && input.request && runtime.request) {
          runtime.request = { ...runtime.request, ...input.request, body: mergeBody(runtime.request.body, input.request.body) };
          runtime.onSuccess = input.onSuccess ?? runtime.onSuccess;
          runtime.onError = input.onError ?? runtime.onError;
          runtime.rollback = input.rollback ?? runtime.rollback;
          const updated = {
            ...existing,
            title: input.title,
            description: input.description,
            status: (online ? "queued" : "offline") as BackgroundSaveJob["status"],
            readyAt: now + (input.debounceMs ?? 400),
            error: undefined,
          };
          patchJob(existing.id, updated);
          persistIfNeeded(updated, runtime);
          return existing.id;
        }
      }

      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `save-${now}-${Math.random().toString(36).slice(2)}`;
      const persist = canPersist(input);
      const job: BackgroundSaveJob = {
        id,
        type: input.type,
        title: input.title,
        description: input.description,
        status: online ? "queued" : "offline",
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
        entityKey: input.entityKey,
        mergeKey: input.mergeKey,
        operation: input.operation,
        page: input.page,
        readyAt: now + (input.debounceMs ?? 0),
        persist,
      };
      const runtime: RuntimeJob = { ...input, maxRetries: input.maxRetries ?? 2 };
      runtimeJobs.current.set(id, runtime);
      setJobs((current) => [job, ...current].slice(0, 30));
      persistIfNeeded(job, runtime);
      return id;
    },
    [online, patchJob, persistIfNeeded],
  );

  const retry = useCallback((id: string) => {
    patchJob(id, { status: navigator.onLine ? "queued" : "offline", readyAt: Date.now(), error: undefined, retryCount: 0 });
  }, [patchJob]);

  const clearFinished = useCallback(() => {
    setJobs((current) => current.filter((job) => job.status !== "saved"));
  }, []);

  const value = useMemo<SaveContextValue>(() => ({ jobs, enqueue, retry, open: () => setPanelOpen(true) }), [enqueue, jobs, retry]);
  const savingCount = jobs.filter((job) => ["queued", "saving", "retrying"].includes(job.status)).length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const offlineCount = jobs.filter((job) => job.status === "offline").length;
  const tone = failedCount ? "failed" : offlineCount ? "offline" : savingCount ? "saving" : "saved";
  const label = failedCount ? `${failedCount} 筆失敗` : offlineCount ? `${offlineCount} 筆離線等待` : savingCount ? `儲存中 ${savingCount}` : "已儲存";

  return (
    <BackgroundSaveContext.Provider value={value}>
      {children}
      <button className={styles.statusButton} data-tone={tone} type="button" onClick={() => setPanelOpen(true)} aria-label={`開啟儲存狀態：${label}`}>
        {savingCount ? <AppIcon className={`${styles.statusIcon} ${styles.spinner}`} name="storage" /> : <span aria-hidden="true">{failedCount ? "!" : offlineCount ? "↯" : "✓"}</span>}
        <span>{label}</span>
      </button>
      {panelOpen ? (
        <>
          <button className={styles.backdrop} type="button" aria-label="關閉儲存狀態" onClick={() => setPanelOpen(false)} />
          <section className={styles.panel} role="dialog" aria-modal="true" aria-label="儲存狀態">
            <header className={styles.panelHeader}>
              <div><h2 className={styles.heading}>儲存狀態</h2><p className={styles.summary}>{label}</p></div>
              <button className={styles.closeButton} type="button" onClick={() => setPanelOpen(false)} aria-label="關閉">×</button>
            </header>
            <div className={styles.jobList}>
              {jobs.length === 0 ? <div className={styles.empty}>目前沒有背景儲存工作。</div> : jobs.map((job) => (
                <article className={styles.job} data-status={job.status} key={job.id}>
                  <div className={styles.jobIcon}><AppIcon name={iconForType(job.type)} /></div>
                  <div className={styles.jobBody}>
                    <div className={styles.jobTitle}>{job.title}</div>
                    <div className={styles.jobMeta}>{job.description || job.operation || "背景儲存"}</div>
                    {job.error ? <div className={styles.jobError}>{job.error}</div> : null}
                    {job.status === "saving" ? <div className={styles.progressTrack}><div className={`${styles.progressBar} ${job.progress === undefined ? styles.indeterminate : ""}`} style={{ "--progress": `${job.progress ?? 42}%` } as CSSProperties} /></div> : null}
                  </div>
                  <div>
                    <div className={styles.jobState}>{stateText(job)}</div>
                    {job.status === "failed" ? <button className={styles.retryButton} type="button" onClick={() => retry(job.id)}>重試</button> : null}
                  </div>
                </article>
              ))}
            </div>
            <footer className={styles.panelFooter}><span className={styles.summary}>切換頁面不會中斷儲存。</span><button className={styles.clearButton} type="button" onClick={clearFinished}>清除已完成</button></footer>
          </section>
        </>
      ) : null}
    </BackgroundSaveContext.Provider>
  );
}

export function useBackgroundSave() {
  const context = useContext(BackgroundSaveContext);
  if (!context) throw new Error("useBackgroundSave 必須在 BackgroundSaveProvider 內使用。");
  return context;
}
