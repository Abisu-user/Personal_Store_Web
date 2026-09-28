export function formatRelativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(timestamp));
}

export function isThisMonth(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
