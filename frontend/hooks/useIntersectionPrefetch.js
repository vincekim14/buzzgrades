import { useEffect, useRef, useCallback } from 'react';
import { usePrefetch } from './usePrefetch';

/**
 * Hook for prefetching with IntersectionObserver
 * Observes first 6-10 visible items and prefetches them
 */
export function useIntersectionPrefetch(items, getHref, maxVisible = 8) {
  const { prefetchDetail } = usePrefetch();
  const observerRef = useRef();
  const prefetchedItems = useRef(new Set());
  
  const handleIntersection = useCallback((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const index = parseInt(element.dataset.index, 10);
        const item = items[index];
        
        if (item) {
          // Get href for this item
          const href = getHref(item);
          if (href && !prefetchedItems.current.has(href)) {
            prefetchedItems.current.add(href);
            prefetchDetail(href);
          }
        }
      }
    });
  }, [items, getHref, maxVisible, prefetchDetail]);
  
  useEffect(() => {
    if (!items?.length) return;
    
    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin: '50px',
      threshold: 0.1
    });
    
    // Observe elements with the prefetch-item data attribute
    const elementsToObserve = document.querySelectorAll('[data-prefetch-item]');
    elementsToObserve.forEach(el => {
      const index = parseInt(el.dataset.index, 10);
      if (index < maxVisible) {
        observerRef.current.observe(el);
      }
    });
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [items, handleIntersection, maxVisible]);
  
  // Reset prefetched items when items array changes
  useEffect(() => {
    prefetchedItems.current.clear();
  }, [items]);
  
  return {
    // Function to manually mark an element for observation
    observeElement: (element) => {
      if (observerRef.current && element) {
        observerRef.current.observe(element);
      }
    },
    // Function to stop observing an element
    unobserveElement: (element) => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element);
      }
    }
  };
}