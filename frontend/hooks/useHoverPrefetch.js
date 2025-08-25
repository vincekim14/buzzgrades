import { useCallback, useRef, useEffect } from 'react';
import { usePrefetch } from './usePrefetch';

/**
 * Hook for hover-intent prefetching
 * Prefetches after 150ms hover delay
 */
export function useHoverPrefetch(href) {
  const { prefetchDetail } = usePrefetch();
  const timeoutRef = useRef();
  const prefetchedRef = useRef(false);
  
  const onMouseEnter = useCallback(() => {
    if (prefetchedRef.current || !href) return;
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    timeoutRef.current = setTimeout(() => {
      prefetchDetail(href);
      prefetchedRef.current = true;
    }, 150); // 150ms delay for hover intent
  }, [href, prefetchDetail]);
  
  const onMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  
  // Reset prefetched state when href changes
  useEffect(() => {
    prefetchedRef.current = false;
  }, [href]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return { 
    onMouseEnter, 
    onMouseLeave,
    isPrefetched: prefetchedRef.current 
  };
}