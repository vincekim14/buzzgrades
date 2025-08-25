import { LRUCache } from '../utils/LRUCache';

// Global cache instance for detail responses (unchanged semantics)
const detailCache = new LRUCache(50, 60 * 60 * 1000); // 50 items, 1 hour TTL

// Cleanup expired items every 10 minutes
setInterval(() => {
  detailCache.cleanup();
}, 10 * 60 * 1000);

export const useLRUCache = () => {
  const getCachedDetail = (route) => {
    return detailCache.get(route);
  };

  const setCachedDetail = (route, data) => {
    detailCache.set(route, data);
  };

  const hasCachedDetail = (route) => {
    return detailCache.has(route);
  };

  const clearCache = () => {
    detailCache.clear();
  };

  return {
    getCachedDetail,
    setCachedDetail,
    hasCachedDetail,
    clearCache,
    cacheSize: detailCache.size(),
  };
};