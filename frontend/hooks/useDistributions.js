import { useState, useEffect } from 'react';
import { usePrefetch } from './usePrefetch';

export const useDistributions = (apiPath, initialData = null) => {
  const [distributions, setDistributions] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);
  const { getCachedData } = usePrefetch();

  useEffect(() => {
    // Skip if we already have data
    if (initialData) {
      setLoading(false);
      return;
    }

    if (!apiPath) {
      setLoading(false);
      return;
    }

    const fetchDistributions = async () => {
      try {
        // Check cache first
        const cached = getCachedData(apiPath);
        if (cached && cached.success) {
          setDistributions(cached.data.distributions);
          setLoading(false);
          return;
        }

        // Fetch from API
        const response = await fetch(apiPath, {
          priority: 'high', // High priority since user is on the page
        });

        if (!response.ok) {
          throw new Error(`Failed to load distributions: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
          setDistributions(data.data.distributions);
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (err) {
        console.error('Distribution loading error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Use a small delay to ensure critical content renders first
    const timeoutId = setTimeout(fetchDistributions, 50);

    return () => clearTimeout(timeoutId);
  }, [apiPath, initialData, getCachedData]);

  return { distributions, loading, error };
};