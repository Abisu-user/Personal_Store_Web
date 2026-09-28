/** Formats an actual aired timestamp (Unix seconds), never a collection edit time. */
export function relativeAiringTime(airedAt: number, now = Date.now()): string {
  const elapsed = Math.max(0, Math.floor((now - airedAt * 1000) / 1000));
  if (elapsed < 60) return "剛剛更新";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} 分鐘前更新`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} 小時前更新`;
  const aired = new Date(airedAt * 1000);
  const today = new Date(now);
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const localAired = new Date(aired.getFullYear(), aired.getMonth(), aired.getDate()).getTime();
  const calendarDays = Math.round((localToday - localAired) / 86400000);
  if (calendarDays === 1) return "昨天更新";
  if (calendarDays < 7) return `${calendarDays} 天前更新`;
  return `${aired.getMonth() + 1} 月 ${aired.getDate()} 日更新`;
}
