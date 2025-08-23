/**
 * Error Handling and Fallback Module
 * Standardized error handling with graceful fallbacks
 */

import { performanceMonitor, queryStats } from './performance.js';

// Standardized FTS5 to LIKE fallback pattern
export const executeWithFallback = (fts5Query, likeQuery, params, label = 'query') => {
  const timer = performanceMonitor.time(label);
  
  try {
    const results = fts5Query.all(...params);
    const duration = timer();
    queryStats.record(label, duration, 'fts5');
    return { results, method: 'fts5', duration };
  } catch (error) {
    const fts5Duration = timer();
    console.warn(`FTS5 error in ${label}: ${error.message}, falling back to LIKE`);
    
    // Restart timer for LIKE query
    const likeTimer = performanceMonitor.time(`${label}-like-fallback`);
    try {
      const results = likeQuery.all(...params);
      const likeDuration = likeTimer();
      queryStats.record(label, fts5Duration + likeDuration, 'like-fallback');
      return { results, method: 'like', duration: fts5Duration + likeDuration };
    } catch (likeError) {
      likeTimer();
      console.error(`Both FTS5 and LIKE failed for ${label}:`, likeError.message);
      throw new Error(`Database query failed: ${label}`);
    }
  }
};

// Enhanced error handling for complex operations
export const safeExecute = (operation, fallback = null, label = 'operation') => {
  const timer = performanceMonitor.time(label);
  
  try {
    const result = operation();
    timer();
    return { result, success: true };
  } catch (error) {
    timer();
    console.warn(`Operation failed: ${label} - ${error.message}`);
    
    if (fallback && typeof fallback === 'function') {
      try {
        const fallbackResult = fallback();
        return { result: fallbackResult, success: true, usedFallback: true };
      } catch (fallbackError) {
        console.error(`Fallback also failed for ${label}:`, fallbackError.message);
      }
    }
    
    return { result: null, success: false, error: error.message };
  }
};

// Retry mechanism for transient failures
export const withRetry = async (operation, maxRetries = 3, delay = 100, label = 'retry-operation') => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        console.error(`All ${maxRetries} attempts failed for ${label}:`, error.message);
        throw error;
      }
      
      console.warn(`Attempt ${attempt}/${maxRetries} failed for ${label}: ${error.message}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  throw lastError;
};