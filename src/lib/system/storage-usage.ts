import "server-only";

const MB = 1024 * 1024;
const GB = 1024 * MB;

function readLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Kept server-side so quota changes never require a component edit. */
export const storageUsageLimits = {
  databaseBytes: readLimit(process.env.DATABASE_LIMIT_BYTES, 500 * MB),
  storageBytes: readLimit(process.env.STORAGE_LIMIT_BYTES, GB),
};

export type CapacityStatus = "healthy" | "growing" | "high" | "critical" | "exceeded";

export function capacityStatus(usedBytes: number, limitBytes: number): CapacityStatus {
  const percent = limitBytes ? (usedBytes / limitBytes) * 100 : 0;
  if (percent >= 100) return "exceeded";
  if (percent >= 95) return "critical";
  if (percent >= 80) return "high";
  if (percent >= 60) return "growing";
  return "healthy";
}

export function quota(usedBytes: number, limitBytes: number) {
  const usagePercent = limitBytes ? Math.round((usedBytes / limitBytes) * 1000) / 10 : 0;
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(limitBytes - usedBytes, 0),
    overageBytes: Math.max(usedBytes - limitBytes, 0),
    usagePercent,
    status: capacityStatus(usedBytes, limitBytes),
  };
}
