import { useEffect, useRef, useState } from "react";
import debounce from "lodash/debounce";
import { useRouter } from "next/router";

// Simple LRU cache for search results
class SearchCache {
  constructor(maxSize = 20, ttlMs = 60000) { // 20 entries, 60s TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.data;
  }
  
  set(key, data) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}

const searchCache = new SearchCache();

export const useSearch = () => {
  const router = useRouter();
  const query = router.query?.q ?? "";
  const [search, setSearch] = useState(query ?? "");
  const [searchResults, setSearchResults] = useState(null);
  const [showPage, setShowPage] = useState(!query);
  
  // AbortController to cancel previous requests
  const abortControllerRef = useRef(null);

  const debouncedShowPage = useRef(
    debounce(() => {
      setShowPage(true);
    }, 750)
  ).current;

  const debouncedSearch = useRef(
    debounce((text) => {
      // Cancel previous request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Check cache first
      const cacheKey = text.toLowerCase().trim();
      const cachedResult = searchCache.get(cacheKey);
      if (cachedResult) {
        setSearchResults(cachedResult);
        return;
      }
      
      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();
      
      fetch(`/api/search?q=${encodeURIComponent(text)}`, {
        signal: abortControllerRef.current.signal
      })
        .then((r) => r.json())
        .then((data) => {
          // Cache successful results
          if (data.success) {
            searchCache.set(cacheKey, data);
          }
          setSearchResults(data);
          abortControllerRef.current = null;
        })
        .catch((error) => {
          // Ignore AbortError (from cancelled requests)
          if (error.name !== 'AbortError') {
            console.error('Search error:', error);
            setSearchResults({ success: false, error: 'Search failed' });
          }
          abortControllerRef.current = null;
        });
    }, 500)
  ).current;

  const handleChange = (value) => {
    setSearch(value);
    setShowPage(false);
    if (value === "") {
      debouncedShowPage();
      debouncedSearch.cancel();
    } else if (value.trim() === "") {
      setSearchResults(null);
      debouncedShowPage.cancel();
      debouncedSearch.cancel();
      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    } else {
      setSearchResults(null);
      debouncedShowPage.cancel();
      debouncedSearch(value);
    }
  };

  useEffect(() => {
    if (query) {
      setSearch(query);
      setShowPage(false);
      debouncedSearch(query);
    }
  }, [query, debouncedSearch]);

  return {
    search,
    searchResults,
    pageShown: [showPage, setShowPage],
    handleChange,
  };
};
