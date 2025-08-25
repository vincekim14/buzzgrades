import { useRouter } from 'next/router';
import { useCallback, useRef } from 'react';
import { useLRUCache } from './useLRUCache';

// Check if user is on a slow connection or has data saving enabled
function isSlowConnection() {
  if (typeof navigator === 'undefined') return false;
  
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  
  return (
    connection.saveData === true ||
    ['2g', 'slow-3g', '3g'].includes(connection.effectiveType)
  );
}

// Global prefetch state to manage concurrency across all instances
const prefetchState = {
  inflight: new Set(),
  maxConcurrent: 3,
  abortControllers: new Map(),
  isNavigating: false,
};

export const usePrefetch = () => {
  const router = useRouter();
  const prefetchedRoutes = useRef(new Set());
  const { getCachedDetail, setCachedDetail, hasCachedDetail } = useLRUCache();

  const prefetchRoute = useCallback((href) => {
    if (!href || prefetchedRoutes.current.has(href)) return;
    if (isSlowConnection() || prefetchState.isNavigating) return;
    
    prefetchedRoutes.current.add(href);
    
    // Prefetch the Next.js page code
    router.prefetch(href).catch(() => {
      // Silently handle prefetch errors
      prefetchedRoutes.current.delete(href);
    });
  }, [router]);

  const warmAPI = useCallback(async (apiPath, detailRoute) => {
    if (!apiPath) return;
    if (isSlowConnection() || prefetchState.isNavigating) return;
    
    // Check if we already have this in the LRU cache
    if (hasCachedDetail(detailRoute)) return;
    
    // Check concurrency limit
    if (prefetchState.inflight.size >= prefetchState.maxConcurrent) return;
    
    // Already warming this API
    if (prefetchState.inflight.has(apiPath)) return;
    
    prefetchState.inflight.add(apiPath);
    
    const abortController = new AbortController();
    prefetchState.abortControllers.set(apiPath, abortController);
    
    try {
      const response = await fetch(`${apiPath}?prefetch=1`, {
        signal: abortController.signal,
        priority: 'low',
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Store in LRU cache for future navigation
          setCachedDetail(detailRoute, result.data);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('API prefetch failed:', apiPath, error);
      }
    } finally {
      prefetchState.inflight.delete(apiPath);
      prefetchState.abortControllers.delete(apiPath);
    }
  }, [hasCachedDetail, setCachedDetail]);

  const prefetchDetail = useCallback((href) => {
    if (!href) return;
    
    // Extract API path from href
    let apiPath;
    if (href.startsWith('/class/')) {
      const classCode = href.replace('/class/', '');
      apiPath = `/api/class/${classCode}`;
    } else if (href.startsWith('/dept/')) {
      const deptCode = href.replace('/dept/', '');
      apiPath = `/api/dept/${deptCode}`;
    } else if (href.startsWith('/inst/')) {
      const profCode = href.replace('/inst/', '');
      apiPath = `/api/prof/${profCode}`;
    }
    
    // Prefetch both route and API
    prefetchRoute(href);
    if (apiPath) {
      warmAPI(apiPath, href);
    }
  }, [prefetchRoute, warmAPI]);

  const cleanup = useCallback(() => {
    // Abort any pending API requests
    for (const controller of prefetchState.abortControllers.values()) {
      controller.abort();
    }
    prefetchState.abortControllers.clear();
    prefetchState.inflight.clear();
  }, []);

  return {
    prefetchDetail,
    getCachedDetail,
    cleanup,
  };
};

// Utility to control navigation state globally
export const setNavigating = (navigating) => {
  prefetchState.isNavigating = navigating;
};