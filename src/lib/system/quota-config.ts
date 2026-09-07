const MB = 1024 * 1024;
const GB = 1024 * MB;

export const quotaConfig = {
  defaultDatabaseBytes: 25 * MB,
  defaultStorageBytes: 500 * MB,
  maximumDatabaseBytes: 500 * MB,
  maximumStorageBytes: 10 * GB,
  warningPercent: 90,
  criticalPercent: 95,
} as const;
