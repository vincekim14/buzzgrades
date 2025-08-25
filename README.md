Image to be addded (TBD)

# Buzz Grades

Buzz Grades is a website displaying all past average grades of courses, professors, and departments at Georgia Tech. By using Python as the backend for handling data on Grade Distribution LITE Reports and building with NextJS and ChakraUI for the frontend, Buzz Grades combines a pleasant UI with the most up-to-date data.

# Setup Instructions

## Prerequisites
- Node.js (>= 18.x)
- Python 3.x
- pipenv

# Set up Python environment when running locally (make sure to .gitignore)

# If depdency error pops up
```bash
python3 -m pip install pandas sqlalchemy requests aiohttp gql rapidfuzz
```

## Frontend Setup
```bash
cd frontend
yarn install
yarn build
yarn dev
```

## Data App Setup
```bash
cd data-app
pipenv install
```

## Required Files (Gitignored - Setup Manually)

### Environment Files
1. **Frontend Environment** - Create `frontend/.env.local`:
   ```
   # Optional GitHub token for contributors API
   # Without this token, the /api/contributors endpoint will return 401 (expected)
   # To get GitHub contributors, add your GitHub personal access token here:
   # GITHUB_TOKEN=your_github_token_here
   
   # Optional Discord webhook for error reporting
   # DISCORD_WEBHOOK=your_discord_webhook_url_here
   
   # Optional Vercel URL for production deployments
   # NEXT_PUBLIC_VERCEL_URL=your_vercel_url_here
   
   # Database path (automatically resolved from current working directory)
   # No configuration needed - uses ../data-app/ProcessedData.db by default
   ```

2. **Database Files**:
   - `data-app/ProcessedData.db` - Main database file (if not present, will be created on first run)

3. **Cache Files**:
   - `data-app/src/rmp/rmp_cache.json` - RateMyProfessor cache (auto-generated on first RMP run)

### Development Dependencies (Auto-installed)
- `frontend/node_modules/` - Installed via `yarn install`
- `frontend/.next/` - Next.js build cache (auto-generated)
- Various `__pycache__/` directories - Python bytecode cache (auto-generated)

## First Run Setup
1. Install dependencies (see Frontend Setup and Data App Setup above)
2. Create environment files if needed
3. Run the frontend: `cd frontend && yarn dev`
4. For RMP data updates: `cd data-app && python3 -m src.rmp`

## Known Issues & Maintenance Notes

### Deprecated Dependencies
- ESLint 8.23.1 is deprecated - consider upgrading to latest ESLint version
- Some `@humanwhocodes` packages are deprecated - will be replaced in future ESLint versions
- These should be updated when convenient, but may require code changes for compatibility

### Security Considerations
- API endpoints include input validation and error handling
- GitHub API calls have proper error handling and fallbacks
- Discord webhook failures are logged but don't crash the application

## Rate My Professor (RMP) Integration

To update professor ratings from Rate My Professor:

```bash
cd data-app
python3 -m src.rmp
```

This fetches and stores:
- Professor ratings (`avgRating`)
- Difficulty scores (`avgDifficulty`) 
- Would Take Again Percentage (`wouldTakeAgainPercent`)
- RMP profile links

Data is automatically matched to Georgia Tech professors in the database.

**Flags:**
- `-dr` or `--disableRMP`: Skip RMP updates

## Troubleshooting

If issue with ./58.js or an error of similar name (e.g. ./109.js), then 

```bash
cd frontend && rm -rf .next && rm -rf node_modules/.cache
```


For performance
'cd frontend && BENCH_ORIGIN=http://localhost:3000 node test_search_benchmark.js | cat'

---

## Performance and headers quick guide

Check search API timings (requires dev or prod server running):

```bash
# Hit search and show headers (X-Search-Duration, X-Total-Duration)
curl -s -D - "http://localhost:3000/api/search?q=CS" -o /dev/null | grep -E "^X-(Search|Total)-Duration|^Cache-Control"

# Health endpoint timing (X-Health-Duration)
curl -s -D - "http://localhost:3000/api/healthz" -o /dev/null | grep -E "^X-Health-Duration|^HTTP"
```

Run warmup (primes routes/statements) then benchmark:

```bash
cd frontend
# Warmup against local server (set port accordingly)
WARMUP_ORIGIN=http://localhost:3000 yarn warmup
# Comprehensive benchmark (adjust origin if needed)
BENCH_ORIGIN=http://localhost:3000 node test_search_benchmark.js | cat
```

Notes:
- First request in dev can be slower due to on-demand compilation; evaluate production with `yarn build && yarn start`.
- For hot department queries, `Cache-Control: s-maxage=30, stale-while-revalidate=300` may appear.