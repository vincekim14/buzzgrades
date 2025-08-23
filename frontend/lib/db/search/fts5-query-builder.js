/**
 * FTS5 Query Builder Module
 * Centralized FTS5 query construction with optimized patterns
 */

import { REGEX_PATTERNS, QUERY_TYPES, PRIORITIES } from '../../constants.js';

// Optimized string operations - cache common transformations
const searchTransforms = new Map();

export const normalizeSearch = (search) => {
  if (!searchTransforms.has(search)) {
    searchTransforms.set(search, search.replace(/\s+/g, ""));
  }
  return searchTransforms.get(search);
};

// Escape FTS5 special characters
export const escapeFTS5Query = (str) => {
  return str.replace(/"/g, '""');
};

// FTS5 Query Builder Class
export class FTS5QueryBuilder {
  constructor(search) {
    this.search = search?.trim() || '';
    this.queryObj = null;
  }

  build() {
    if (!this.search) return null;
    
    return this.checkFallbacks() || this.buildFTS5Query();
  }

  checkFallbacks() {
    // Scenario 1: Pure numeric searches - ANY length (e.g. "1", "12", "1332", "12345")
    if (REGEX_PATTERNS.PURE_NUMERIC.test(this.search)) {
      return null; // Use LIKE fallback for cross-department course number search
    }
    
    // Scenario 2: Single alphabetic character searches (e.g. "A", "B") 
    if (this.search.length === 1 && REGEX_PATTERNS.SINGLE_ALPHA.test(this.search)) {
      return null; // Use LIKE fallback as FTS5 often ignores single chars
    }
    
    // Scenario 3: ONLY special characters/punctuation (e.g. "-", ":", "!!!")
    if (REGEX_PATTERNS.SPECIAL_CHARS_ONLY.test(this.search)) {
      return null; // Use LIKE fallback as FTS5 strips these during tokenization
    }

    return null; // Continue to FTS5 query building
  }

  buildFTS5Query() {
    // Enhanced course code detection with compiled patterns
    const courseCodeExact = this.search.match(REGEX_PATTERNS.COURSE_CODE_EXACT);
    const courseCodePartial = this.search.match(REGEX_PATTERNS.COURSE_CODE_PARTIAL);
    
    if (courseCodeExact) {
      return this.buildExactCourseQuery(courseCodeExact);
    }
    
    if (courseCodePartial) {
      return this.buildPartialCourseQuery(courseCodePartial);
    }
    
    // For alphabetic department codes (any length), use prefix search
    if (REGEX_PATTERNS.ALPHABETIC_DEPT.test(this.search)) {
      return this.buildDeptPrefixQuery();
    }
    
    // Multi-word searches - use phrase search
    if (this.search.includes(' ')) {
      return this.buildPhraseQuery();
    }
    
    // Single words with special characters - use phrase search
    if (REGEX_PATTERNS.SPECIAL_CHARS_PRESENT.test(this.search)) {
      return this.buildPhraseQuery();
    }
    
    // Default: prefix search
    return this.buildPrefixQuery();
  }

  buildExactCourseQuery(courseCodeExact) {
    const dept = courseCodeExact[1].toUpperCase();
    const number = courseCodeExact[2];
    
    // OPTIMIZED: Search specific columns based on input format
    const compact = dept + number;
    const spaced = dept + ' ' + number;
    
    // Use column-specific search for better performance
    if (this.search.includes(' ')) {
      // Input has space - search spaced column first, then compact as fallback
      return {
        query: `course_code_spaced:"${escapeFTS5Query(spaced)}" OR course_code_compact:"${escapeFTS5Query(compact)}"`,
        type: QUERY_TYPES.EXACT_COURSE,
        boost: true,
        priority: PRIORITIES.EXACT_COURSE,
        useFastQuery: true
      };
    } else {
      // Input has no space - search compact column first, then spaced as fallback  
      return {
        query: `course_code_compact:"${escapeFTS5Query(compact)}" OR course_code_spaced:"${escapeFTS5Query(spaced)}"`,
        type: QUERY_TYPES.EXACT_COURSE,
        boost: true,
        priority: PRIORITIES.EXACT_COURSE,
        useFastQuery: true
      };
    }
  }

  buildPartialCourseQuery(courseCodePartial) {
    const dept = courseCodePartial[1].toUpperCase();
    const partialNumber = courseCodePartial[2];
    
    if (partialNumber) {
      // Partial course number: "CS13" -> matches "CS1301", "CS1331"
      return {
        query: `course_code_compact:${escapeFTS5Query(dept + partialNumber)}* OR course_code_spaced:${escapeFTS5Query(dept + ' ' + partialNumber)}*`,
        type: QUERY_TYPES.PARTIAL_COURSE,
        boost: true,
        priority: PRIORITIES.PARTIAL_COURSE
      };
    } else {
      // Department prefix search: "CS" - very high priority
      return {
        query: `department:${escapeFTS5Query(dept)}*`,
        type: QUERY_TYPES.DEPT_PREFIX,
        boost: true,
        priority: PRIORITIES.DEPT_PREFIX
      };
    }
  }

  buildDeptPrefixQuery() {
    return {
      query: `${escapeFTS5Query(this.search.toUpperCase())}*`,
      type: QUERY_TYPES.DEPT_PREFIX,
      boost: true,
      priority: PRIORITIES.DEPT_PREFIX
    };
  }

  buildPhraseQuery() {
    const words = this.search.split(/\s+/).filter(word => word.length > 0);
    if (words.length >= 2) {
      return {
        query: `"${escapeFTS5Query(this.search)}"`,
        type: QUERY_TYPES.PHRASE,
        boost: false,
        priority: PRIORITIES.PHRASE
      };
    }
    
    // Single word with special characters
    return {
      query: `"${escapeFTS5Query(this.search)}"`,
      type: QUERY_TYPES.PHRASE,
      boost: false,
      priority: PRIORITIES.PREFIX
    };
  }

  buildPrefixQuery() {
    return {
      query: `${escapeFTS5Query(this.search)}*`,
      type: QUERY_TYPES.PREFIX,
      boost: false,
      priority: PRIORITIES.PREFIX
    };
  }
}

// Factory function for backward compatibility
export const toFTS5Query = (search) => {
  return new FTS5QueryBuilder(search).build();
};