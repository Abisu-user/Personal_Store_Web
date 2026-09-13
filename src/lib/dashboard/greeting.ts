export type DashboardGreeting = "早安" | "午安" | "下午好" | "晚安" | "夜深了";

export function getDashboardGreeting(now = new Date()): DashboardGreeting {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return "早安";
  if (hour >= 11 && hour < 14) return "午安";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚安";
  return "夜深了";
}

export function millisecondsUntilNextGreetingBoundary(now = new Date()) {
  const next = new Date(now);
  const nextHour = [5, 11, 14, 18, 23].find((hour) => hour > now.getHours());
  if (nextHour === undefined) {
    next.setDate(next.getDate() + 1);
    next.setHours(5, 0, 0, 0);
  } else {
    next.setHours(nextHour, 0, 0, 0);
  }
  return Math.max(1, next.getTime() - now.getTime() + 50);
}
