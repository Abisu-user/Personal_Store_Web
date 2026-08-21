export type FolderLockKind = "bookmark" | "note" | "code" | "file" | "photo";
export type FolderLockMode = "pin4" | "pin6" | "password";

export type FolderLockStatus = {
  is_locked?: boolean;
  lock_mode?: FolderLockMode | null;
};

