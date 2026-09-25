/** Список IMEI из текстового поля: по одному на строку (или через запятую/пробел), без пустых. */
export function parseSerialList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Повторы внутри списка — подсветить до отправки на сервер. */
export function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
