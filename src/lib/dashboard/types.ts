export type DashboardKind = "bookmark" | "anime" | "note" | "code" | "photo" | "file";
export type RecentDashboardItem = { id: string; kind: DashboardKind; title: string; updatedAt: string; href: string };
export type DashboardData = {
  counts: Record<DashboardKind, number | null>;
  recent: RecentDashboardItem[];
  recentAvailable: boolean;
  capacity: {
    databaseUsedBytes: number; databaseQuotaBytes: number; databaseUnlimited: boolean;
    storageUsedBytes: number; storageQuotaBytes: number; storageUnlimited: boolean;
  } | null;
};
