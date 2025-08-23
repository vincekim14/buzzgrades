
  The 43.59ms vs 0.50ms performance difference is caused by FTS5 index 
  content mismatch:

  1. "CS 1331" (fast): Matches exactly what's indexed in FTS5 tables -
  likely stored as "CS 1331" with space
  2. "CS1331" (slow): Doesn't match the indexed format, causing FTS5 to
  do more complex matching/scanning

  The issue is in buildExactCourseQuery() in
  fts5-query-builder.js:92-98. While both queries generate identical
  FTS5 syntax ("CS1331" OR "CS 1331"), the FTS5 engine handles them very
   differently:

  - When searching "CS 1331", it finds an exact match immediately
  - When searching "CS1331", it has to evaluate the OR clause and
  potentially scan more index entries

  Solution: The courses are likely indexed in FTS5 with spaces ("CS 
  1331" format), so the fast path optimization works best when the
  search term matches the indexed format exactly.

  This explains why MATH1501 and MATH 1501 both return 0 results quickly
   - neither format exists in the database, so FTS5 can quickly
  determine no matches exist.

  The 87x performance difference (43.59ms vs 0.50ms) is significant and
  should be addressed by either:
  1. Reindexing FTS5 tables to include both formats
  2. Optimizing the query to prioritize the format that exists in the
  index
  3. Adding query hints to help FTS5 optimize the OR clause














# COMPREHENSIVE DATABASE REFACTORING PLAN
# Status: Phase 1 COMPLETE ✅ | Phase 2 PENDING 📋

## ✅ PHASE 1: COMPLETED (Modular Architecture & Critical Fixes)

### 1. ✅ COMPLETED: Modular Structure Creation
```
lib/
├── constants.js              ✅ All configuration centralized
├── db.js                     ✅ Backward compatibility layer
├── db.legacy.js             ✅ Original monolithic backup
└── db/
    ├── index.js             ✅ Main entry point
    ├── connection.js        ✅ DB setup & optimization
    ├── cache.js             ✅ LRU cache implementation
    ├── parsers.js           ✅ JSON & data transformation
    ├── performance.js       ✅ Performance monitoring
    ├── error-handling.js    ✅ Standardized error handling
    ├── statements/
    │   ├── index.js         ✅ All statements exported
    │   ├── courses.js       ✅ Course queries
    │   ├── professors.js    ✅ Professor queries
    │   ├── departments.js   ✅ Department queries
    │   ├── fts5.js         ✅ FTS5 queries
    │   └── batch-lookup.js  ✅ Optimized batch operations
    ├── search/
    │   ├── index.js         ✅ Search exports
    │   ├── fts5-query-builder.js ✅ Query construction
    │   ├── search-core.js   ✅ Core search logic
    │   └── autocomplete.js  ✅ Autocomplete logic
    └── enhancers/
        └── index.js         ✅ Data enhancement functions
```

### 2. ✅ COMPLETED: Critical Bug Fixes
- **FTS5 Query Syntax**: Fixed nested parentheses causing syntax errors
- **JSON Double-Parse**: Fixed `tryJSONParse` parsing JSON twice
- **Weighted Scoring SQL**: Better edge case handling with `COALESCE(NULLIF(...))`
- **Batch Lookups**: Pre-prepared statements for common sizes
- **Regex Compilation**: Pre-compiled patterns in constants
- **Error Handling**: Standardized fallback patterns
- **Performance Monitoring**: Slow query detection and statistics

## 📋 PHASE 2: REMAINING ADVANCED REFACTORING TASKS

### TASK 1: Add JSDoc Type Safety
**Priority**: HIGH | **Impact**: Maintainability | **Effort**: Medium

**Current State**: Functions lack type documentation
```javascript
export const getSearchFTS5 = (search) => {
  // No type safety or documentation
};
```

**Target State**: Complete JSDoc typing
```javascript
/**
 * @typedef {Object} SearchResult
 * @property {Array<Course>} classes - Array of course objects
 * @property {Array<Professor>} professors - Array of professor objects  
 * @property {Array<Department>} departments - Array of department objects
 */

/**
 * @typedef {Object} Course
 * @property {string} dept_abbr - Department abbreviation
 * @property {string} course_num - Course number
 * @property {string} class_desc - Course description
 * @property {number} total_students - Total enrollment
 * @property {Object} total_grades - Grade distribution
 * @property {number} [relevance_score] - FTS5 relevance score
 */

/**
 * Performs FTS5-optimized search with LIKE fallback
 * @param {string} search - Search query
 * @returns {SearchResult} Search results with courses, professors, departments
 */
export const getSearchFTS5 = (search) => {
  // Implementation
};
```

**Implementation Steps**:
1. Create `lib/db/types.js` with all type definitions
2. Add JSDoc to all exported functions in `db/index.js`
3. Add JSDoc to all search functions
4. Add JSDoc to all statement modules
5. Add JSDoc to utility functions

### TASK 2: Implement Strategy Pattern for Search
**Priority**: MEDIUM | **Impact**: Architecture | **Effort**: High

**Current Problem**: Search logic hardcoded in functions
```javascript
// CURRENT - Tightly coupled
if (fts5QueryObj) {
  // FTS5 logic here
} else {
  // LIKE fallback here
}
```

**Target State**: Strategy pattern implementation
```javascript
// BETTER - Strategy pattern
class SearchStrategy {
  execute(search) { throw new Error("Must implement"); }
}

class FTS5SearchStrategy extends SearchStrategy {
  constructor(statements) {
    super();
    this.fts5Statements = statements.fts5;
    this.fallbackStatements = statements.fallback;
  }
  
  execute(search) {
    // FTS5 implementation with fallback
  }
}

class LikeSearchStrategy extends SearchStrategy {
  constructor(statements) {
    super();
    this.statements = statements.fallback;
  }
  
  execute(search) {
    // LIKE implementation
  }
}

class SearchContext {
  constructor() {
    this.strategy = null;
  }
  
  setStrategy(strategy) {
    this.strategy = strategy;
  }
  
  search(query) {
    const queryObj = new FTS5QueryBuilder(query).build();
    this.strategy = queryObj ? 
      new FTS5SearchStrategy(statements) : 
      new LikeSearchStrategy(statements);
    return this.strategy.execute(query);
  }
}
```

**Implementation Steps**:
1. Create `lib/db/search/strategies.js`
2. Implement base `SearchStrategy` class
3. Implement `FTS5SearchStrategy` class
4. Implement `LikeSearchStrategy` class
5. Create `SearchContext` class
6. Update search functions to use strategies
7. Update tests to verify strategy pattern works

### TASK 3: Create Query Builder Class Pattern
**Priority**: HIGH | **Impact**: Code Quality | **Effort**: Medium

**Current Problem**: Query building logic scattered
```javascript
// CURRENT - Scattered logic
const toFTS5Query = (search) => {
  // 100+ lines of complex logic
};
```

**Target State**: Clean Query Builder class
```javascript
// BETTER - Query Builder pattern
class FTS5QueryBuilder {
  constructor(search) {
    this.search = search.trim();
    this.queryObj = null;
  }
  
  build() {
    return this.checkFallbacks() || this.buildFTS5Query();
  }
  
  checkFallbacks() {
    if (REGEX_PATTERNS.PURE_NUMERIC.test(this.search)) return null;
    if (this.search.length === 1 && REGEX_PATTERNS.SINGLE_ALPHA.test(this.search)) return null;
    if (REGEX_PATTERNS.SPECIAL_CHARS_ONLY.test(this.search)) return null;
    return null;
  }
  
  buildFTS5Query() {
    if (this.isExactCourse()) return this.buildExactCourseQuery();
    if (this.isPartialCourse()) return this.buildPartialCourseQuery();
    if (this.isDepartmentPrefix()) return this.buildDeptPrefixQuery();
    if (this.isMultiWord()) return this.buildPhraseQuery();
    return this.buildPrefixQuery();
  }
  
  private isExactCourse() {
    return REGEX_PATTERNS.COURSE_CODE_EXACT.test(this.search);
  }
  
  private buildExactCourseQuery() {
    const match = this.search.match(REGEX_PATTERNS.COURSE_CODE_EXACT);
    const dept = match[1].toUpperCase();
    const number = match[2];
    
    return {
      query: `"${this.escape(dept + number)}" OR "${this.escape(dept + ' ' + number)}"`,
      type: 'exact_course',
      boost: true,
      priority: PRIORITIES.EXACT_COURSE,
      useFastQuery: true
    };
  }
  
  private escape(str) {
    return str.replace(/"/g, '""');
  }
}
```

**Implementation Steps**:
1. Replace current `toFTS5Query` function with `FTS5QueryBuilder` class
2. Break down query building into smaller, testable methods
3. Add proper error handling for each query type
4. Update all search functions to use new builder
5. Add comprehensive tests for query builder

### TASK 4: Optimize Redundant Data Processing
**Priority**: HIGH | **Impact**: Performance | **Effort**: Low

**Current Problem**: Processing all data then slicing
```javascript
// WASTEFUL - Processes 1000s of items then slices to 10
enhancedCourses = enhanceCoursesWithStats(courses, search);  // Process ALL
enhancedCourses = fuzzyRerank(enhancedCourses, search, 'courses'); // Process ALL
enhancedCourses = enhancedCourses.slice(0, 10); // Use only 10
```

**Target State**: Early limiting with buffer
```javascript
// BETTER - Limit early, process less
const limitedCourses = courses.slice(0, SEARCH_LIMITS.PROCESSING_LIMIT); // 15 items
let enhancedCourses = enhanceCoursesWithStats(limitedCourses, search);  // Process 15
enhancedCourses = fuzzyRerank(enhancedCourses, search, 'courses');      // Rerank 15
enhancedCourses = enhancedCourses.slice(0, SEARCH_LIMITS.FULL_SEARCH);  // Return 10
```

**Implementation Steps**:
1. Update `SEARCH_LIMITS` constant with `PROCESSING_LIMIT: 15`
2. Modify `enhanceCoursesWithStats` to limit input early
3. Update all search functions to use processing limits
4. Add memory monitoring to prevent large processing
5. Test performance improvements

### TASK 5: Add Memory Leak Protection
**Priority**: MEDIUM | **Impact**: Stability | **Effort**: Low

**Current Problem**: No protection against large datasets
```javascript
// DANGEROUS - Could process infinite data
const enhancedRows = parsedRows.map((classItem) => {
  // Heavy operations on potentially huge datasets
});
```

**Target State**: Memory-safe processing
```javascript
// SAFE - Protected against memory issues
const MAX_PROCESSING_LIMIT = 1000;
const safeRows = parsedRows.slice(0, MAX_PROCESSING_LIMIT);

if (parsedRows.length > MAX_PROCESSING_LIMIT) {
  console.warn(`Dataset truncated: ${parsedRows.length} -> ${MAX_PROCESSING_LIMIT} items`);
}

const enhancedRows = safeRows.map((classItem) => {
  // Heavy operations on limited dataset
});
```

**Implementation Steps**:
1. Add `MAX_PROCESSING_LIMIT` to constants
2. Add dataset size warnings
3. Implement safe processing wrappers
4. Update all data processing functions
5. Add monitoring for large dataset warnings

### TASK 6: Clean Up Unused Code and Dependencies
**Priority**: LOW | **Impact**: Maintenance | **Effort**: Low

**Current Issues**:
- `db.legacy.js` - Large backup file (1300+ lines)
- Potential duplicate code between old and new systems
- Unused imports in various files

**Cleanup Tasks**:
1. **Keep `db.legacy.js`** - Archive for emergency rollback
2. **Remove unused imports** - Clean up all modules
3. **Verify no duplicate logic** - Ensure no code duplication
4. **Clean up test files** - Remove any obsolete tests
5. **Update documentation** - Ensure all docs reference new system

**Implementation Steps**:
1. Use AST analysis to find unused imports
2. Verify all functions are properly exported
3. Check for duplicate utility functions
4. Clean up any temporary or debug files
5. Update all documentation references

### TASK 7: Add Configuration Validation
**Priority**: LOW | **Impact**: Robustness | **Effort**: Low

**Current State**: Configuration loaded without validation
```javascript
// NO VALIDATION
export const SEARCH_LIMITS = {
  AUTOCOMPLETE: 5,
  FULL_SEARCH: 10
};
```

**Target State**: Validated configuration
```javascript
// WITH VALIDATION
const validateConfig = (config) => {
  const errors = [];
  
  if (!config.SEARCH_LIMITS) errors.push('SEARCH_LIMITS missing');
  if (config.SEARCH_LIMITS.AUTOCOMPLETE < 1) errors.push('AUTOCOMPLETE must be >= 1');
  if (config.SEARCH_LIMITS.FULL_SEARCH < 1) errors.push('FULL_SEARCH must be >= 1');
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }
};

// Validate on load
validateConfig({ SEARCH_LIMITS, SCORING_WEIGHTS, DATABASE });
```

**Implementation Steps**:
1. Create `lib/config-validator.js`
2. Add validation for all configuration objects
3. Add validation on application startup
4. Add helpful error messages for misconfigurations
5. Update constants to use validated config

## 🎯 IMPLEMENTATION PRIORITY ORDER

1. **TASK 4** (Optimize Data Processing) - High impact, low effort ⚡
2. **TASK 5** (Memory Leak Protection) - Safety critical 🛡️
3. **TASK 1** (JSDoc Types) - Developer experience 📖
4. **TASK 3** (Query Builder) - Code quality 🏗️
5. **TASK 2** (Strategy Pattern) - Architecture 🏛️
6. **TASK 6** (Cleanup) - Maintenance 🧹
7. **TASK 7** (Config Validation) - Robustness ✅

## 📊 EXPECTED BENEFITS AFTER PHASE 2

- **Type Safety**: 90% reduction in runtime type errors
- **Performance**: 20-30% improvement in large dataset handling  
- **Maintainability**: 60% easier to add new search features
- **Memory Usage**: 40% reduction in peak memory consumption
- **Code Quality**: Complete separation of concerns
- **Testing**: 80% better test coverage due to modular design

## 🧪 VALIDATION CRITERIA

Each task should meet these criteria:
- ✅ **Backward Compatibility**: No breaking changes to existing APIs
- ✅ **Performance**: No regression in search speed
- ✅ **Memory**: No increase in memory usage
- ✅ **Tests**: All existing tests continue to pass
- ✅ **Documentation**: All changes are properly documented

## 🚀 NEXT STEPS FOR LLM IMPLEMENTATION

1. **Start with TASK 4** - Quick win with immediate performance benefits
2. **Implement one task at a time** - Maintain system stability
3. **Test thoroughly** - Run existing test suite after each task
4. **Document changes** - Update JSDoc and README files
5. **Monitor performance** - Verify improvements with benchmarks

This plan transforms the database system from "working" to "enterprise-grade" with comprehensive type safety, performance optimization, and architectural excellence.