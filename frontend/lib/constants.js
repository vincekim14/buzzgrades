/**
 * Database Configuration Constants
 * Centralized configuration for the database layer
 */

// Cache Configuration
export const CACHE = {
  SEARCH_SIZE: 50,
  AUTOCOMPLETE_SIZE: 100,
  TTL_MS: 3600000 // 1 hour
};

// Search Limits
export const SEARCH_LIMITS = {
  AUTOCOMPLETE: 5,
  FULL_SEARCH: 10,
  FUZZY_RERANK_THRESHOLD: 3,
  FAST_QUERY_LIMIT: 10,
  PROCESSING_LIMIT: 15 // Buffer for reranking before final slice
};

// Scoring Weights
export const SCORING_WEIGHTS = {
  RELEVANCE: 0.7,
  POPULARITY: 0.3
};

// Database Configuration  
export const DATABASE = {
  MMAP_SIZE: 268435456, // 256MB
  PRAGMAS: [
    'temp_store = MEMORY',
    'mmap_size = 268435456'
  ]
};

// Performance Thresholds
export const PERFORMANCE = {
  SLOW_QUERY_THRESHOLD: 100, // Log queries slower than 100ms
  BATCH_SIZE_THRESHOLD: 1 // Use batch queries when > 1 item
};

// Regex Patterns (compiled once for performance)
export const REGEX_PATTERNS = {
  PURE_NUMERIC: /^\d+$/,
  SINGLE_ALPHA: /^[A-Za-z]$/,
  COURSE_CODE_EXACT: /^([A-Z]{2,6})\s*(\d{3,5}[A-Z]?)$/i,
  COURSE_CODE_PARTIAL: /^([A-Z]{2,6})\s*(\d{1,4})?$/i,
  ALPHABETIC_DEPT: /^[A-Z]+$/i,
  SPECIAL_CHARS_ONLY: /^[^A-Za-z0-9\s]+$/,
  SPECIAL_CHARS_PRESENT: /[!"#%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~]/
};

// GPA Mapping
export const GPA_MAP = {
  A: 4.0,
  B: 3.0, 
  C: 2.0,
  D: 1.0,
  F: 0.0
};

// Query Types for FTS5
export const QUERY_TYPES = {
  EXACT_COURSE: 'exact_course',
  PARTIAL_COURSE: 'partial_course',
  DEPT_PREFIX: 'dept_prefix',
  PHRASE: 'phrase',
  PREFIX: 'prefix'
};

// Priority Levels
export const PRIORITIES = {
  EXACT_COURSE: 1000,
  DEPT_PREFIX: 900,
  PARTIAL_COURSE: 800,
  PHRASE: 400,
  PREFIX: 200
};