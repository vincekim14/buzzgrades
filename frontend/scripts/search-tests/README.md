# Search Tests Organization

## Core Test Files (Essential - Keep)

### `run-all-tests.js`
- **Purpose**: Master test runner for the complete search system
- **Usage**: `node scripts/search-tests/run-all-tests.js`
- **Status**: ✅ Essential - Primary test orchestrator

### `test-db-queries.js`
- **Purpose**: Core database functionality and FTS5 table verification
- **Validates**: Database connections, table structures, query safety, FTS5 availability
- **Status**: ✅ Essential - Foundation tests

### `test-fts5-comprehensive.js`
- **Purpose**: Comprehensive FTS5 functionality across all query types
- **Validates**: Course codes, department prefixes, professor names, autocomplete, BM25 scoring
- **Status**: ✅ Essential - Core FTS5 validation

### `test-fts5-usage-comprehensive.js` ⭐ **NEW**
- **Purpose**: Validates optimized FTS5 usage (73%+ vs previous ~50%)
- **Validates**: Only 3 scenarios use LIKE fallback, everything else uses FTS5
- **Status**: ✅ Essential - FTS5 optimization validation

### `test-bm25-ranking.js`
- **Purpose**: BM25 relevance scoring validation and ranking consistency
- **Validates**: Score distribution, ranking logic, autocomplete scoring
- **Status**: ✅ Essential - Search quality assurance

## Performance & Analysis (Keep for Reference)

### `test-performance.js`
- **Purpose**: Performance benchmarking FTS5 vs LIKE across query types
- **Results**: Shows 2-487x FTS5 performance gains
- **Status**: 📊 Reference - Performance validation

### `test-caching.js`  
- **Purpose**: LRU cache behavior and edge cache header validation
- **Validates**: Cache hits/misses, eviction policy, HTTP cache headers
- **Status**: 🗄️ Reference - Caching system tests

### `test-fuzzy-reranking.js`
- **Purpose**: Fuzzy search and Levenshtein distance reranking validation
- **Validates**: String matching, score combination, scarce result handling
- **Status**: 🔄 Reference - Fuzzy search tests

## Development & Debugging Tools (Keep)

### `debug-fts5-behavior.js`
- **Purpose**: Debug tool for analyzing FTS5 vs LIKE query behavior
- **Usage**: Helps diagnose search issues and fallback patterns
- **Status**: 🔧 Debug Tool - Keep for troubleshooting

## Completed Analysis (Archive)

### `test-micro-benchmarks.js`
- **Purpose**: Detailed micro-performance analysis of FTS5 operations
- **Achievement**: Proved FTS5 superiority, guided optimization decisions
- **Status**: 📁 Archive - Analysis complete, keep for reference

### `test-pure-fts5-performance.js`  
- **Purpose**: Pure FTS5 performance testing without LIKE comparisons
- **Achievement**: Validated FTS5-only performance characteristics
- **Status**: 📁 Archive - Analysis complete, reference only

## Server-Dependent Tests (Manual)

### `test-api-endpoints.js`
- **Purpose**: API endpoint testing with live server
- **Requirement**: Requires `npm run dev` server running on localhost:3000
- **Usage**: Run manually when testing API changes
- **Status**: 🌐 Manual - Server-dependent testing

## Test Organization Summary

### ✅ Always Run (via `run-all-tests.js`):
1. `test-db-queries.js` - Database foundation
2. `test-fts5-comprehensive.js` - Core FTS5 functionality  
3. `test-fts5-usage-comprehensive.js` - FTS5 optimization validation
4. `test-bm25-ranking.js` - Search quality
5. `test-performance.js` - Performance benchmarks
6. `test-caching.js` - Cache behavior
7. `test-fuzzy-reranking.js` - Fuzzy search

### 🔧 Debug When Needed:
- `debug-fts5-behavior.js` - For troubleshooting search issues

### 📁 Archive (Keep for Reference):
- `test-micro-benchmarks.js` - Detailed benchmarking archive
- `test-pure-fts5-performance.js` - Pure FTS5 analysis archive

### 🌐 Manual Testing:
- `test-api-endpoints.js` - Requires running server

## Testing Workflow

### Daily Development Testing:
```bash
node scripts/search-tests/run-all-tests.js
```

### API Integration Testing:
```bash
# Terminal 1
npm run dev

# Terminal 2  
node scripts/search-tests/test-api-endpoints.js
```

### Debug Search Issues:
```bash
node scripts/search-tests/debug-fts5-behavior.js
```

### Performance Analysis:
```bash
node scripts/search-tests/test-performance.js
node scripts/search-tests/test-micro-benchmarks.js  # Detailed analysis
```

---

*Test files organized after FTS5 optimization project completion*