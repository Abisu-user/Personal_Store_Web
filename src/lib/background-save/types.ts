export type BackgroundSaveStatus =
  | "queued"
  | "saving"
  | "saved"
  | "failed"
  | "retrying"
  | "offline";

export type BackgroundSaveRequest = {
  url: string;
  method: "POST" | "PATCH" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
};

export type BackgroundSaveJob = {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: BackgroundSaveStatus;
  progress?: number;
  progressLabel?: string;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  error?: string;
  entityKey?: string;
  mergeKey?: string;
  operation?: string;
  page?: string;
  readyAt: number;
  persist: boolean;
};

export type BackgroundSaveExecutionContext = {
  signal: AbortSignal;
  reportProgress: (progress: number | undefined, label?: string) => void;
};

export type EnqueueBackgroundSave = {
  type: string;
  title: string;
  description?: string;
  entityKey?: string;
  mergeKey?: string;
  operation?: string;
  page?: string;
  request?: BackgroundSaveRequest;
  execute?: (context: BackgroundSaveExecutionContext) => Promise<unknown>;
  persist?: boolean;
  sensitive?: boolean;
  debounceMs?: number;
  maxRetries?: number;
  rollbackOnFailure?: boolean;
  onSuccess?: (result: unknown) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  rollback?: () => void | Promise<void>;
};

export type PersistedBackgroundSaveJob = BackgroundSaveJob & {
  userId: string;
  request: BackgroundSaveRequest;
  maxRetries: number;
};
