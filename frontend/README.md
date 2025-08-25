# Frontend (Next.js + Chakra UI)

## Setup
```bash
cd frontend
yarn install
yarn build
yarn dev
```

## Data dependencies
- Database: resolved at runtime to `../data-app/ProcessedData.db` (relative to `frontend/`).
- Course metadata: `../data-app/COURSE_INFO/cumulative.json` (used for titles and requisites tooltips).

Ensure both files exist when running locally or in production.

## Updating data
When `ProcessedData.db` or `COURSE_INFO/cumulative.json` change:
1) Restart dev server (`yarn dev`) or redeploy in production.
2) Warm routes (optional but recommended):
```bash
cd frontend
WARMUP_ORIGIN=http://localhost:3000 yarn warmup
```
This primes prepared statements and CDN/browser caches for hot endpoints.

## Caching
- Detail APIs (`/api/class|dept|prof`) send `Cache-Control: public, s-maxage=604800, stale-while-revalidate=2592000`.
- Pages set SSR headers with the same semantics.
- Client prefetch uses a small concurrency limit and an in-memory LRU to reduce duplicate work.

## Notes on SQLite side files
If you see `ProcessedData.db-wal` and `ProcessedData.db-shm` after data generation, checkpoint and switch to DELETE journal mode before shipping to production:
```sql
PRAGMA wal_checkpoint(TRUNCATE);
PRAGMA journal_mode=DELETE;
```
Then you can safely omit `-wal`/`-shm` files. Do not delete them during writes.


