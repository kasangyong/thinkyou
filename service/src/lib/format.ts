export function kstDay(d = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
}

export function kstTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// 최근 7일 / 그 전 7일의 개수
export function splitWeeks(isoTimes: string[], now = Date.now()) {
  const week = 7 * 24 * 3600 * 1000;
  let thisWeek = 0;
  let lastWeek = 0;
  for (const t of isoTimes) {
    const age = now - new Date(t).getTime();
    if (age < week) thisWeek++;
    else if (age < 2 * week) lastWeek++;
  }
  return { thisWeek, lastWeek };
}
