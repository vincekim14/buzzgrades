class LRUCache {
  constructor(maxSize = 50, ttl = 60 * 60 * 1000) { // 1 hour TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if item has expired
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    
    return item.data;
  }

  set(key, data) {
    const item = {
      data,
      timestamp: Date.now(),
    };

    // If key exists, delete it first
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // If at capacity, remove least recently used (first item)
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    // Add new item
    this.cache.set(key, item);
  }

  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;

    // Check if expired
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  // Clean up expired items
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instance for detail responses
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