/**
 * Performance Monitoring Module
 * Tracks query performance and provides optimization insights
 */

import { PERFORMANCE } from '../constants.js';

// Performance monitoring utilities
export const performanceMonitor = {
  time: (label) => {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      if (duration > PERFORMANCE.SLOW_QUERY_THRESHOLD) {
        console.warn(`🐌 Slow query: ${label} took ${duration}ms`);
      }
      return duration;
    };
  },

  timeAsync: (label) => {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      if (duration > PERFORMANCE.SLOW_QUERY_THRESHOLD) {
        console.warn(`🐌 Slow async operation: ${label} took ${duration.toFixed(2)}ms`);
      }
      return duration;
    };
  },

  profile: (fn, label) => {
    const timer = performanceMonitor.time(label);
    try {
      const result = fn();
      timer();
      return result;
    } catch (error) {
      timer();
      throw error;
    }
  },

  profileAsync: async (fn, label) => {
    const timer = performanceMonitor.timeAsync(label);
    try {
      const result = await fn();
      timer();
      return result;
    } catch (error) {
      timer();
      throw error;
    }
  }
};

// Query statistics tracking
class QueryStats {
  constructor() {
    this.stats = new Map();
  }

  record(queryType, duration, method = 'unknown') {
    if (!this.stats.has(queryType)) {
      this.stats.set(queryType, {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        maxTime: 0,
        minTime: Infinity,
        methods: new Set()
      });
    }

    const stat = this.stats.get(queryType);
    stat.count++;
    stat.totalTime += duration;
    stat.avgTime = stat.totalTime / stat.count;
    stat.maxTime = Math.max(stat.maxTime, duration);
    stat.minTime = Math.min(stat.minTime, duration);
    stat.methods.add(method);
  }

  getStats(queryType) {
    return this.stats.get(queryType);
  }

  getAllStats() {
    const result = {};
    this.stats.forEach((stat, queryType) => {
      result[queryType] = {
        ...stat,
        methods: Array.from(stat.methods)
      };
    });
    return result;
  }

  reset() {
    this.stats.clear();
  }
}

export const queryStats = new QueryStats();

// Enhanced query execution with performance tracking
export const executeWithPerformanceTracking = (query, params, label, method = 'sqlite') => {
  const timer = performanceMonitor.time(label);
  try {
    const result = query.all(...params);
    const duration = timer();
    queryStats.record(label, duration, method);
    return result;
  } catch (error) {
    timer();
    throw error;
  }
};