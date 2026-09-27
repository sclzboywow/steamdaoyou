const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getShanghaiDateKey(date = new Date()): string {
  const parts = SHANGHAI_DATE_FORMATTER.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');

  if (!year || !month || !day) {
    throw new Error('Failed to resolve Asia/Shanghai business date');
  }

  return `${year}-${month}-${day}`;
}

export function getShanghaiDayStart(date = new Date()): Date {
  return new Date(`${getShanghaiDateKey(date)}T00:00:00+08:00`);
}
