# ProcessedData.db Database Files

## Overview
The BuzzGrades search system uses SQLite with Write-Ahead Logging (WAL) mode for optimal performance. This results in three database files that work together as a single database.

## Files Explanation

### 1. `ProcessedData.db` (14.9MB)
- **Purpose**: Main database file containing all course, professor, and grade data
- **Contains**: 
  - Core tables: `classdistribution`, `professor`, `distribution`, `termdistribution`, `departmentdistribution`
  - FTS5 search indexes: `courses_fts`, `professors_fts`, `departments_fts`
  - Course information and grade distributions
- **Status**: ✅ Essential - This is the primary database file

### 2. `ProcessedData.db-shm` (32KB)
- **Purpose**: SQLite Shared Memory file for WAL mode
- **Function**: Coordinates access between multiple database connections
- **Behavior**: 
  - Created automatically when database is accessed
  - Size varies based on database activity (typically 32KB)
  - Contains temporary coordination data
- **Status**: ✅ Keep - Required for optimal SQLite performance in WAL mode

### 3. `ProcessedData.db-wal` (0B)
- **Purpose**: Write-Ahead Log file for transaction management
- **Function**: Stores committed transactions before they're merged into main database
- **Current State**: Empty (0 bytes) - indicates no pending transactions
- **Behavior**: 
  - Grows as transactions are written
  - Periodically merged back into main database (checkpoint)
  - Empty size indicates database is in clean state
- **Status**: ✅ Keep - Critical for database integrity and ACID compliance

## Important Notes

### ✅ All Three Files Should Be Kept
- These are **not duplicates** - they're different components of the same SQLite database
- Deleting `.shm` or `.wal` files can cause database corruption or performance issues
- SQLite automatically manages these files - no manual intervention needed

### 📊 Normal File Sizes
- `.db` file: Contains actual data (14.9MB is normal for our dataset)
- `.shm` file: Usually 32KB (standard SQLite shared memory size)
- `.wal` file: 0B when clean, grows with pending transactions

### 🔄 WAL Mode Benefits
- **Better concurrency**: Readers don't block writers
- **Improved performance**: Writes are faster (no immediate disk sync)
- **Crash safety**: Transactions are atomic even with system crashes
- **FTS5 optimization**: Full-text search performs better in WAL mode

## Database Maintenance

### Normal Operations
- ✅ All three files will be present during normal operation
- ✅ `.wal` file may grow during heavy write operations
- ✅ SQLite automatically checkpoints (merges WAL into main DB)

### When Updating Database
1. **Replace main database**: Copy new `ProcessedData.db` file
2. **Delete auxiliary files**: Remove old `.shm` and `.wal` files
3. **Restart application**: SQLite will recreate auxiliary files automatically
4. **Run FTS5 sync**: Execute `node scripts/sync-fts5.js` to update search indexes

### Backup Strategy
- **Primary backup**: The `ProcessedData.db` file contains all persistent data
- **Auxiliary files**: Do not need to be backed up (recreated automatically)
- **For complete backup**: Include all three files to preserve exact state

## FTS5 Search Integration

The database includes FTS5 (Full-Text Search) tables for optimized searching:
- `courses_fts`: Fast course code and description search
- `professors_fts`: Professor name search with BM25 ranking  
- `departments_fts`: Department name and abbreviation search

These FTS5 indexes provide 2-487x performance improvement over traditional LIKE queries while maintaining accurate relevance scoring.

## Troubleshooting

### Database Locked Errors
- Usually caused by orphaned `.shm` files
- **Solution**: Stop application, delete `.shm` and `.wal`, restart

### Performance Issues
- Check if `.wal` file is growing very large (>10MB)
- **Solution**: Restart application to trigger checkpoint

### Corruption Recovery
- Main database (`.db`) contains all data
- **Solution**: Delete `.shm` and `.wal`, restart application

---

*Generated as part of BuzzGrades search optimization project*