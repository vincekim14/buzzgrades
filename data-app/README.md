# Georgia Tech Data Processing & RMP Integration

This data-app processes Georgia Tech grade distribution data and integrates Rate My Professor (RMP) ratings to provide comprehensive course and instructor information for the Buzz Grades website.

# Important Note on Restriction Data in COURSE_INFO
For maximum breadth, get term jsons since Summer 2016, when our data csv starts up until the current, most recent up-to-date term. Only four terms will be uploaded for now to save space, and if a course was not taught for four terms, this is sufficient justification to not include restriction/requisite info for that course since it will likely not be offered in the upcoming semester.

Therefore, processing the most recent 4-8 terms into json files for COURSE_INFO is more than sufficient.

## Features

- **CSV Data Processing**: Import and process GT grade distribution data
- **Enhanced RMP Integration**: Advanced professor matching with fuzzy matching and nickname expansion
- **Automatic Data Quality**: Name normalization, duplicate detection, and validation
- **Flexible Commands**: Multiple processing modes for different use cases

## Quick Start

### Full Data Processing (CSV + RMP)
```bash
python3 main.py --process-all
## Publishing updated data to the frontend

After processing, ensure the frontend can read the latest artifacts:

1) Verify artifacts
- `ProcessedData.db` exists at `data-app/ProcessedData.db`.
- `COURSE_INFO/cumulative.json` exists and contains course title/prereq metadata.

2) Finalize SQLite journal mode for distribution
- If you processed with WAL mode, checkpoint and switch to DELETE before copying the DB to production:
  ```sql
  -- inside sqlite3 shell connected to data-app/ProcessedData.db
  PRAGMA wal_checkpoint(TRUNCATE);
  PRAGMA journal_mode=DELETE;
  ```
- This eliminates `ProcessedData.db-wal` and `ProcessedData.db-shm` so the frontend only needs the single `.db` file.

3) Restart and warm
- Restart the frontend server to pick up changes.
- Warm routes to prime caches: `cd frontend && WARMUP_ORIGIN=http://localhost:3000 yarn warmup`.

```

### RMP Processing Only
```bash
# Basic RMP processing with automatic cleanup
python3 main.py --rmp-only

# RMP processing with explicit name cleanup
python3 main.py --rmp-only --clean-professors

# Standalone RMP processing with options (cleanup only, fast)
python3 -m src.rmp --clean-names --fix-duplicates

# Get current RMP statistics
python3 -m src.rmp --stats-only
```

## Enhanced RMP Matching System

The RMP system includes advanced matching capabilities that significantly improve professor coverage:

### Automatic Features
- **Name Normalization**: Fixes case issues ("lukas wessels" → "Lukas Wessels")
- **Duplicate Detection**: Automatically merges duplicate professor entries
- **Title Removal**: Handles "Dr.", "Prof.", "Jr.", "Sr." etc.
- **Nickname Expansion**: Matches "Bob Smith" with "Robert Smith" and vice versa
- **Fuzzy Matching**: High-confidence partial matching (requires `rapidfuzz`)
- **Data Validation**: Only stores valid RMP data, rejects null/empty values

### Coverage & Performance
- **Current Coverage**: ~47% of professors have RMP data
- **Enhanced Matching**: Expected 55-65% coverage with new system  
- **Smart Caching**: 60-80% fewer API calls on subsequent runs
- **Quality Control**: Conservative matching prevents false positives

## Manual RMP Management

For professors that the automatic matching system cannot find, you can manually add RMP links using several methods:

### Individual Manual Addition

Add a single professor's RMP data when you know their RMP ID:

```bash
# Extract RMP ID from URL: https://www.ratemyprofessors.com/professor/123456
python -m src.rmp --add-manual "Professor Name" --rmp-id "123456"
```

### Bulk Import via CSV

1. **Export unmatched professors** to get a template:
```bash
python -m src.rmp --export-unmatched unmatched_professors.csv
```

2. **Research and fill in RMP IDs** in the CSV:
```csv
professor_name,rmp_id,notes
"John Smith","123456","Verified exact match"
"Jane Doe","789012","Found via alternate spelling"
```

3. **Save as `rmp_requests_by_users.csv`** and import:
```bash
python -m src.rmp --import-manual rmp_requests_by_users.csv
```

### Smart Cache Integration

- **Manual entries bypass API calls**: Once added, professors won't be searched again
- **Cache persistence**: Manual entries are stored permanently in `rmp_cache.json`
- **Automatic cleanup**: Manual entries remove professors from "negative" (not found) cache
- **Priority system**: Manual cache is checked first before API searches

### Workflow Example

```bash
# 1. See current coverage
python -m src.rmp --stats-only

# 2. Export unmatched professors for research
python -m src.rmp --export-unmatched unmatched_professors.csv

# 3. Research RMP IDs and save as rmp_requests_by_users.csv

# 4. Import manual mappings
python -m src.rmp --import-manual rmp_requests_by_users.csv

# 5. Run regular RMP processing to fetch full data for manual entries
python -m src.rmp --rmp-only

# 6. Check improved coverage
python -m src.rmp --stats-only
```

## Command Reference

### Main Script Commands

```bash
# Full processing (recommended for new terms)
python main.py --process-all

# RMP-only processing
python main.py --rmp-only [--clean-professors]

# Skip RMP processing entirely
python main.py --process-all --disableRMP

# Database management
python main.py --cleardb --process-all  # Full reset
python main.py --overwrite --process-all  # Overwrite existing terms
```

### Standalone RMP Module

```bash
# Full processing with all enhancements (RMP fetching)
python -m src.rmp

# Individual cleanup operations (fast, no API calls)
python -m src.rmp --fix-duplicates     # Merge duplicates only

# RMP data fetching only (no cleanup)
python -m src.rmp --rmp-only           # Fetch RMP data without cleanup

# Manual RMP management
python -m src.rmp --add-manual "Professor Name on Website" --rmp-id "numberID at the end of rmp link"  # Add single manual entry
# example: 1841430      in         https://www.ratemyprofessors.com/professor/1841430
python -m src.rmp --import-manual rmp_requests_by_users.csv        # Bulk import from CSV
python -m src.rmp --export-unmatched unmatched_professors.csv      # Export unmatched for research

# Information and testing
python -m src.rmp --stats-only         # Show coverage statistics
python -m src.rmp --dry-run            # Show what would be done
python -m src.rmp --validate-urls      # Verify RMP links (slower)
python -m src.rmp --debug              # Enable detailed debugging output
```

## Data Quality Standards

### RMP Data Validation
- **Required Fields**: avgRating, avgDifficulty, legacyId must be present
- **Valid Ranges**: Rating/Difficulty: 0-5, Would Take Again: 0-100%
- **URL Verification**: RMP links validated before storage
- **No Null Values**: Invalid or incomplete data is rejected

### Professor Name Normalization
- **Title Case**: "john smith" → "John Smith" 
- **Special Names**: Handles "McDonald", "O'Brien", "de Silva" correctly
- **Title Removal**: "Dr. John Smith Jr." → "John Smith"
- **Duplicate Merging**: Combines entries with identical canonical names

## Troubleshooting

### Common Issues

**Low RMP Coverage**
- Install `rapidfuzz` for fuzzy matching: `pip install rapidfuzz`
- Run with name cleanup: `python main.py --rmp-only --clean-professors`

**Database Issues** 
- Reset database: `python main.py --cleardb --process-all`
- Check permissions on ProcessedData.db file (located in data-app directory)

**RMP API Errors**
- Rate limiting: System uses 5 processes max to avoid blocking
- Network issues: RMP requests include retry logic and caching

**Name Matching Problems**
- Check professor name formatting in database
- Use `--clean-professors` flag for automatic fixes
- Verify nickname mappings in rmp.py
- Use manual RMP addition for missed matches

**Manual RMP Issues**
- Verify RMP ID format: Must be numeric (from RMP URL)
- Check professor name exact match in database
- Ensure CSV headers: `professor_name,rmp_id,notes`
- Manual entries persist until manually removed from cache

### Performance Tips
- **First Run**: Expect slower processing for initial RMP data fetch
- **Subsequent Runs**: 60-80% faster due to smart caching
- **Cleanup Operations**: Individual flags (`--clean-names`, `--fix-duplicates`) are very fast (no API calls)
- **Bandwidth**: RMP data fetching requires stable internet connection
- **Processing Time**: ~30 seconds per 1000 professors for RMP fetching

## File Structure

```
data-app/
├── main.py                 # Main processing script
├── src/
│   ├── rmp/
│   │   ├── rmp.py         # Enhanced RMP processing
│   │   ├── __main__.py    # Standalone RMP module
│   │   └── rmp_cache.json # RMP response cache
│   └── generation/
│       └── process.py     # CSV data processing
├── db/
│   └── Models.py          # Database models
├── GRADE_DATA/            # CSV files directory
├── rmp_requests_by_users.csv  # Manual RMP mappings (user-created)
└── ProcessedData.db       # Main database (now located within data-app)
```

## Expected Coverage Metrics

| Processing Mode | Coverage | API Calls | Features |
|----------------|----------|-----------|----------|
| **Legacy System** | ~44% | High | Exact matching only |
| **Enhanced (No Fuzzy)** | ~50% | Medium | +Nicknames, cleanup |
| **Enhanced (Full)** | ~60% | Low (cached) | +Fuzzy matching |
| **Enhanced + Manual** | ~75%+ | Minimal | +Manual RMP additions |

*Coverage percentages based on historical GT professor data*