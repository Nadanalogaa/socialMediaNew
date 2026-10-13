import { useEffect, useState } from 'react';

/**
 * Tracks a media query.
 *
 * Used where mobile needs a genuinely different structure rather than a
 * restyled one — a three-column editor cannot simply be made narrower.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Below Tailwind's `lg`, where the editor's columns stop fitting. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
