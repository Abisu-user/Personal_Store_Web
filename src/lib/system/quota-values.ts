export type QuotaUnit = "MB" | "GB";

export const quotaUnitBytes: Record<QuotaUnit, number> = {
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

const decimalPattern = /^\d+(?:\.\d+)?$/;

export function quotaInitialValue(bytes: number): { value: string; unit: QuotaUnit } {
  if (bytes >= quotaUnitBytes.GB && bytes % quotaUnitBytes.GB === 0) {
    return { value: String(bytes / quotaUnitBytes.GB), unit: "GB" };
  }
  return { value: String(Math.round((bytes / quotaUnitBytes.MB) * 100) / 100), unit: "MB" };
}

export function parseQuotaInput(value: string, unit: QuotaUnit) {
  if (!decimalPattern.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const bytes = Math.round(number * quotaUnitBytes[unit]);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}
