export type TaiwanHoliday = { date: string; name: string; isHoliday: boolean; type: "national-holiday" | "observed-holiday" | "festival" };

// 2026 government-office days: DGPA 115-year calendar and holiday schedule.
// https://www.dgpa.gov.tw/information?pid=12685&uid=41
// These are system data, never copied into users' calendar_events rows.
const yearData: Record<number, TaiwanHoliday[]> = {
  2026: [
    ["01-01", "元旦", true, "national-holiday"],
    ["02-15", "除夕前一日", true, "national-holiday"],
    ["02-16", "除夕", true, "national-holiday"],
    ["02-17", "春節", true, "national-holiday"],
    ["02-18", "春節", true, "national-holiday"],
    ["02-19", "春節", true, "national-holiday"],
    ["02-20", "春節補假", true, "observed-holiday"],
    ["02-27", "和平紀念日補假", true, "observed-holiday"],
    ["02-28", "和平紀念日", true, "national-holiday"],
    ["03-08", "婦女節", false, "festival"],
    ["03-12", "植樹節", false, "festival"],
    ["03-29", "青年節", false, "festival"],
    ["04-03", "兒童節補假", true, "observed-holiday"],
    ["04-04", "兒童節", true, "national-holiday"],
    ["04-05", "清明節", true, "national-holiday"],
    ["04-06", "清明節補假", true, "observed-holiday"],
    ["05-01", "勞動節", true, "national-holiday"],
    ["05-10", "母親節", false, "festival"],
    ["06-19", "端午節", true, "national-holiday"],
    ["08-08", "父親節", false, "festival"],
    ["09-21", "國家防災日", false, "festival"],
    ["09-25", "中秋節", true, "national-holiday"],
    ["09-28", "孔子誕辰紀念日／教師節", true, "national-holiday"],
    ["10-09", "國慶日補假", true, "observed-holiday"],
    ["10-10", "國慶日", true, "national-holiday"],
    ["10-25", "臺灣光復暨金門古寧頭大捷紀念日", true, "national-holiday"],
    ["10-26", "臺灣光復暨金門古寧頭大捷紀念日補假", true, "observed-holiday"],
    ["12-10", "人權日", false, "festival"],
    ["12-25", "行憲紀念日", true, "national-holiday"],
  ].map(([day, name, isHoliday, type]) => ({ date: `2026-${day}`, name, isHoliday, type })) as TaiwanHoliday[],
};

export function getTaiwanHolidays(from: string, to: string) {
  const years = Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 }, (_, index) => Number(from.slice(0, 4)) + index);
  return years.flatMap((year) => yearData[year] ?? []).filter((holiday) => holiday.date >= from && holiday.date <= to);
}
