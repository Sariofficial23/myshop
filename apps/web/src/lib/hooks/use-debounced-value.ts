import { useEffect, useState } from 'react';

/** Значение, обновляющееся не чаще, чем раз в delay мс (для поиска при вводе). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
