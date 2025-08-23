import { useEffect, useRef, useState } from "react";
import debounce from "lodash/debounce";
import { useRouter } from "next/router";

export const useSearch = () => {
  const router = useRouter();
  const query = router.query?.q ?? "";
  const [search, setSearch] = useState(query ?? "");
  const [searchResults, setSearchResults] = useState(null);
  const [showPage, setShowPage] = useState(!query);
  
  // Client-side cache for search results
  const searchCacheRef = useRef(new Map());

  const debouncedShowPage = useRef(
    debounce(() => {
      setShowPage(true);
    }, 750)
  ).current;

  // Optimized search with caching and faster debounce
  const debouncedSearch = useRef(
    debounce(async (text) => {
      // Check cache first
      const cacheKey = text.toLowerCase().trim();
      if (searchCacheRef.current.has(cacheKey)) {
        setSearchResults(searchCacheRef.current.get(cacheKey));
        return;
      }

      try {
        const startTime = Date.now();
        const response = await fetch(`/api/search?q=${encodeURIComponent(text)}`);
        const data = await response.json();
        const endTime = Date.now();
        
        // Log performance in development
        if (process.env.NODE_ENV !== "production") {
          console.log(`Search "${text}" took ${endTime - startTime}ms (client-side)`);
        }
        
        // Cache the result (limit cache size to 30 entries for search)
        if (searchCacheRef.current.size >= 30) {
          const firstKey = searchCacheRef.current.keys().next().value;
          searchCacheRef.current.delete(firstKey);
        }
        searchCacheRef.current.set(cacheKey, data);
        
        setSearchResults(data);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults({ 
          success: false, 
          error: "Search failed",
          data: { classes: [], professors: [], departments: [] }
        });
      }
    }, 300) // Faster debounce for better UX
  ).current;

  const handleChange = (value) => {
    setSearch(value);
    setShowPage(false);
    
    if (value === "") {
      debouncedShowPage();
      debouncedSearch.cancel();
      setSearchResults(null);
    } else if (value.trim() === "") {
      setSearchResults(null);
      debouncedShowPage.cancel();
      debouncedSearch.cancel();
    } else {
      setSearchResults(null);
      debouncedShowPage.cancel();
      debouncedSearch(value);
    }
  };

  const handleNavigation = (href, item) => {
    // Clear search state and navigate
    setShowPage(true);
    router.push(href);
  };

  // Clear cache when component unmounts or router changes significantly
  useEffect(() => {
    return () => {
      searchCacheRef.current.clear();
    };
  }, [router.pathname]);

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
    handleNavigation,
    // Expose cache stats for debugging
    getCacheStats: () => ({
      searchCacheSize: searchCacheRef.current.size,
    }),
  };
};
