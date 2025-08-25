/*
  Comprehensive Search Benchmark
  - Measures cold vs warm performance for:
    1) Direct DB search via getSearchFTS5() (loaded via dynamic import)
    2) API endpoint /api/search?q=
  - Reports p50/p95 per phase and flags slow cases
*/

const http = require('node:http');

const API_ORIGIN = process.env.BENCH_ORIGIN || 'http://localhost:3000';
const WARMUP_REPS = 2;
const RUN_REPS = 8;
const SLOW_THRESHOLD_MS = 50; // target per request

const TEST_CASES = [
  { name: 'Dept (CS)', q: 'CS' },
  { name: 'Dept (MATH)', q: 'MATH' },
  { name: 'Course code (CS 1332)', q: 'CS 1332' },
  { name: 'Course code (CHEM 1211K)', q: 'CHEM 1211K' },
  { name: 'Content (algorithms)', q: 'algorithms' },
  { name: 'Content (data structures)', q: 'data structures' },
];

function p(nums, pct) {
  if (nums.length === 0) return 0;
  const arr = [...nums].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(arr.length - 1, Math.floor((pct / 100) * (arr.length - 1))));
  return arr[idx];
}

async function benchDirectDB(query) {
  const times = [];
  // Dynamically import ESM module from CJS context
  const { getSearchFTS5 } = await import('./lib/db/fts-search.js');
  for (let i = 0; i < RUN_REPS; i++) {
    const t0 = Date.now();
    await getSearchFTS5(query);
    times.push(Date.now() - t0);
  }
  return times;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { JSON.parse(data); } catch { /* ignore parse errors */ }
        resolve(Date.now() - t0);
      });
    });
    req.on('error', reject);
  });
}

async function benchAPI(query) {
  const times = [];
  for (let i = 0; i < RUN_REPS; i++) {
    const ms = await httpGet(`${API_ORIGIN}/api/search?q=${encodeURIComponent(query)}`);
    times.push(ms);
  }
  return times;
}

async function run() {
  console.log('🧪 Comprehensive Search Benchmark');
  console.log('=================================');
  console.log(`Origin: ${API_ORIGIN}`);
  console.log('');

  for (const t of TEST_CASES) {
    console.log(`\n📋 ${t.name}: "${t.q}"`);
    console.log('-'.repeat(48));

    // Warm-up API to simulate cold→warm
    for (let i = 0; i < WARMUP_REPS; i++) {
      try { await httpGet(`${API_ORIGIN}/api/search?q=${encodeURIComponent(t.q)}`); } catch {}
    }

    // Direct DB
    let dbTimes = [];
    try {
      dbTimes = await benchDirectDB(t.q);
      console.log(`DB   p50=${p(dbTimes, 50)}ms p95=${p(dbTimes, 95)}ms [${dbTimes.join(', ')}]`);
    } catch (e) {
      console.log(`DB   (skipped, import failed: ${e.message})`);
    }

    // API
    const apiTimes = await benchAPI(t.q);
    const p50 = p(apiTimes, 50);
    const p95 = p(apiTimes, 95);
    const slow = p50 > SLOW_THRESHOLD_MS ? '❌ SLOW' : '✅ OK';
    console.log(`API  p50=${p50}ms p95=${p95}ms [${apiTimes.join(', ')}] ${slow}`);
  }

  console.log('\n✅ Benchmark complete');
}

run().catch((e) => {
  console.error('❌ Benchmark failed', e);
  process.exit(1);
});


