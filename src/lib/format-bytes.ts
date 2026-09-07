export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const number = value / 1024 ** index;
  return `${number >= 100 || index === 0 ? Math.round(number) : number.toFixed(number >= 10 ? 1 : 2)} ${units[index]}`;
}

export function usagePercentage(usedBytes: number, limitBytes: number) {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(limitBytes) || limitBytes <= 0) return 0;
  return Math.round((Math.max(0, usedBytes) / limitBytes) * 1000) / 10;
}
