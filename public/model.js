export const TYPES = ['노방', '소모임', '1도구', '개척지인', '지인', '기타'];

export function summarize(records, getKey) {
  const totals = new Map();
  for (const record of records) {
    const key = getKey(record);
    totals.set(key, (totals.get(key) ?? 0) + record.count);
  }
  return totals;
}

export function flatten(sources) {
  return sources.flatMap(source => source.records.map(record => ({
    ...record,
    month: source.month,
    week: source.week,
  })));
}
