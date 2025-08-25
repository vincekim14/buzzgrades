import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useLRUCache } from './useLRUCache';

export const useDetailData = (initialData, apiPath) => {
  const router = useRouter();
  const { getCachedDetail, setCachedDetail, hasCachedDetail } = useLRUCache();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    // If we have initial SSR data, cache it
    if (initialData && router.asPath) {
      setCachedDetail(router.asPath, initialData);
    }
  }, [initialData, router.asPath, setCachedDetail]);

  const refreshData = async () => {
    if (!apiPath) return;
    
    setLoading(true);
    try {
      const response = await fetch(apiPath);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(result.data);
          if (router.asPath) {
            setCachedDetail(router.asPath, result.data);
          }
        }
      }
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    refreshData,
    isCached: hasCachedDetail(router.asPath),
  };
};