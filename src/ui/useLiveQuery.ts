import { liveQuery } from 'dexie';
import { useEffect, useState, type DependencyList } from 'react';

/** Re-runs a Dexie query whenever the tables it reads change. undefined while loading. */
export function useLiveQuery<T>(query: () => Promise<T>, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: setValue,
      error: (e: unknown) => console.error('liveQuery failed', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
