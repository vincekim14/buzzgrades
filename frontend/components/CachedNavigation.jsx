import { useRouter } from 'next/router';
import { useEffect, useState, createContext, useContext } from 'react';
import { useLRUCache } from '../hooks/useLRUCache';

const CachedNavigationContext = createContext({});

export const useCachedNavigation = () => useContext(CachedNavigationContext);

export const CachedNavigationProvider = ({ children }) => {
  const router = useRouter();
  const { getCachedDetail, setCachedDetail } = useLRUCache();
  const [cachedData, setCachedData] = useState(null);
  const [isCacheHit, setIsCacheHit] = useState(false);

  useEffect(() => {
    const handleRouteChangeStart = (url) => {
      // Only handle detail routes
      if (url.match(/^\/(class|dept|inst)\//)) {
        const cached = getCachedDetail(url);
        if (cached) {
          setCachedData(cached);
          setIsCacheHit(true);
        } else {
          setCachedData(null);
          setIsCacheHit(false);
        }
      }
    };

    const handleRouteChangeComplete = () => {
      // Reset after navigation completes
      setTimeout(() => {
        setIsCacheHit(false);
        setCachedData(null);
      }, 100);
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
    };
  }, [router.events, getCachedDetail]);

  return (
    <CachedNavigationContext.Provider
      value={{
        cachedData,
        isCacheHit,
        setCachedDetail,
        getCachedDetail,
      }}
    >
      {children}
    </CachedNavigationContext.Provider>
  );
};