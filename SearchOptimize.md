# High-Performance Search System Implementation Plan
**Database: SQLite + FTS5 | Target: Sub-50ms search latency**

## Current Status Assessment

### ✅ Successfully Implemented (Phase 1 Complete):
- **better-sqlite3**: Replaced sqlite3 → 2-3x performance boost via synchronous queries
- **Prepared statements**: All queries pre-compiled with db.prepare() for zero-parse overhead  
- **Multi-layer caching**: Server LRU (50/100 entries) + client-side (30/50) + edge cache headers
- **Optimized debouncing**: 150ms autocomplete, 300ms full search
- **Autocomplete API**: /api/autocomplete endpoint with client-side caching
- **Performance achieved**: 6ms-270ms (meets basic latency targets)

### ❌ Missing High-Impact Optimizations (Phase 2 - The Real Gains):
- **FTS5 virtual tables**: Missing 10-100x search performance boost
- **WAL mode**: Database not optimized for concurrent reads  
- **True prefix matching**: Using LIKE '%query%' instead of FTS5 prefix search
- **Relevance ranking**: No FTS5 scoring algorithms
- **Expected improvement**: 1-50ms consistently (vs current 6-270ms)

---

## Implementation Strategy

### Database Architecture Decision: Single Database Approach
- **Keep**: Single `ProcessedData.db` file for maintainability
- **Add**: FTS5 virtual tables that reference existing data (no duplication)
- **Strategy**: Temporarily writable for setup/updates → read-only for production

---

## Phase 2: Complete FTS5 Implementation

### Step 1: Database Permission Management

#### Development Environment:
```bash
# Make database writable for FTS5 setup
chmod 644 ../data-app/ProcessedData.db

# Run FTS5 setup script (one-time)
node scripts/setup-fts5.js

# Return to read-only
chmod 444 ../data-app/ProcessedData.db
```

#### Production/Deployment Workflow:
```bash
# During deployment with database updates:
1. Deploy new code
2. chmod 644 ProcessedData.db  # Temporarily writable
3. Update data from JSON sources
4. node scripts/sync-fts5.js   # Sync FTS5 tables
5. chmod 444 ProcessedData.db  # Back to read-only
6. Restart application
```

#### Regular Data Updates (when fetching from JSON files):
```bash
# When updating course data, grades, etc.
chmod 644 ProcessedData.db
# Run your existing data import scripts
node scripts/update-course-data.js  # Your existing scripts
node scripts/sync-fts5.js           # Sync FTS5 tables
chmod 444 ProcessedData.db
```

### Step 2: FTS5 Database Setup

#### FTS5 Virtual Tables Design:
```sql
-- Courses FTS5 table
CREATE VIRTUAL TABLE courses_fts USING fts5(
  course_code,      -- "CS1301", "MATH1501" 
  course_name,      -- "CS 1301", "MATH 1501"
  class_desc,       -- Original descriptions
  oscar_title,      -- Full course titles from JSON
  department,       -- "CS", "MATH"
  tokenize = "unicode61 remove_diacritics 2",
  prefix = '2 3 4',
  content = 'classdistribution',
  content_rowid = 'id'
);

-- Professors FTS5 table  
CREATE VIRTUAL TABLE professors_fts USING fts5(
  name,             -- Full professor names
  tokenize = "unicode61 remove_diacritics 2",
  prefix = '2 3 4',
  content = 'professor', 
  content_rowid = 'id'
);

-- Departments FTS5 table
CREATE VIRTUAL TABLE departments_fts USING fts5(
  dept_abbr,        -- "CS", "ECE"
  dept_name,        -- "Computer Science", "Electrical and Computer Engineering"
  tokenize = "unicode61 remove_diacritics 2",
  prefix = '2 3 4',
  content = 'departmentdistribution',
  content_rowid = 'rowid'
);
```

#### Sync Triggers (Keep FTS5 Updated):
```sql
-- Auto-sync triggers when main data changes
CREATE TRIGGER courses_fts_insert AFTER INSERT ON classdistribution 
BEGIN
  INSERT INTO courses_fts(rowid, course_code, course_name, class_desc, oscar_title, department)
  SELECT NEW.id, NEW.dept_abbr || NEW.course_num, NEW.dept_abbr || ' ' || NEW.course_num, 
         NEW.class_desc, NULL, NEW.dept_abbr;
END;

-- Similar triggers for UPDATE and DELETE operations
```

### Step 3: Optimized Database Configuration
```sql
-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;  -- 256MB
PRAGMA cache_size = 10000;
```

---

## Phase 3: Search Query Optimization

### Current vs FTS5 Query Comparison:

#### Current LIKE Queries (Slow):
```sql
-- Current autocomplete (6-30ms)
SELECT * FROM classdistribution 
WHERE dept_abbr || course_num LIKE '%CS%' 
ORDER BY total_students DESC LIMIT 5;
```

#### Optimized FTS5 Queries (Fast):
```sql
-- FTS5 autocomplete (1-5ms)
SELECT c.* FROM courses_fts cf
JOIN classdistribution c ON cf.rowid = c.id
WHERE courses_fts MATCH 'CS*'
ORDER BY rank, c.total_students DESC LIMIT 5;
```

### True Autocomplete with Prefix Matching:
- **Current**: Searches anywhere in text (`%CS%` matches "PHYSICS")
- **FTS5**: True prefix search (`CS*` only matches "CS1301", "CSE6242")
- **Performance**: 10-100x faster, especially on large datasets

---

## Phase 4: Implementation Files

### Required New Files:
1. **`scripts/setup-fts5.js`** - One-time FTS5 table creation
2. **`scripts/sync-fts5.js`** - Sync FTS5 after data updates  
3. **`scripts/db-permissions.js`** - Helper for permission management
4. **Updated `lib/db.js`** - FTS5 queries replacing LIKE queries

### Database Helper Updates:
- Replace LIKE queries with FTS5 MATCH
- Add FTS5 relevance scoring  
- Implement true prefix matching
- Add fallback to LIKE queries if FTS5 fails

---

## Expected Performance Results

### Target Performance (with FTS5):
- **Autocomplete**: 1-5ms (vs current 6-30ms)
- **Full search**: 5-50ms (vs current 50-270ms)  
- **Scaling**: Performance stays consistent as data grows
- **Relevance**: Much better result ranking

### Deployment Strategy:
1. **Development**: Test FTS5 implementation locally
2. **Staging**: Validate performance improvements  
3. **Production**: Deploy with database migration
4. **Monitoring**: Track performance metrics and fallback usage

---

## Maintenance Workflow

### Regular Data Updates:
```bash
# When updating course/grade data
./scripts/make-db-writable.sh
# Run your existing data import scripts
./scripts/sync-fts5.sh  
./scripts/make-db-readonly.sh
```

### Emergency Rollback:
- FTS5 queries include fallback to LIKE queries
- Can disable FTS5 via environment variable
- Database changes are non-destructive (virtual tables)

This implementation provides the true high-performance search system while maintaining your single-database architecture and existing workflows.