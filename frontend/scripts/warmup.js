#!/usr/bin/env node

/**
 * Production warmup script for BuzzGrades search API
 * 
 * Fires 6-10 GETs to /api/search with hot queries to warm up:
 * - Route/module loading
 * - Database connection
 * - Prepared statement cache
 * - FTS5 query templates
 */

const https = require('https');
const http = require('http');

// Get origin from environment or default to localhost:3000
const ORIGIN = process.env.BENCH_ORIGIN || process.env.WARMUP_ORIGIN || 'http://localhost:3000';

// Hot queries as specified in CLAUDE.md cold start mitigation plan
const HOT_QUERIES = [
  'CS',          // Dept search
  'MATH',        // Dept search  
  'CS 1332',     // Course code search
  'CHEM 1211K',  // Course code search with letter suffix
  'algorithms',  // Content search
  'data structures', // Multi-word content search
  'PHYS',        // Additional dept search
  'linear algebra', // Additional content search
];

const makeRequest = (query) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/search?q=${encodeURIComponent(query)}`, ORIGIN);
    const client = url.protocol === 'https:' ? https : http;
    
    const startTime = Date.now();
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        const searchDuration = res.headers['x-search-duration'];
        const totalDuration = res.headers['x-total-duration'];
        
        if (res.statusCode === 200) {
          console.log(`✅ "${query}": ${duration}ms (search: ${searchDuration}, total: ${totalDuration})`);
          resolve({ query, duration, status: res.statusCode });
        } else {
          console.warn(`⚠️  "${query}": HTTP ${res.statusCode} in ${duration}ms`);
          resolve({ query, duration, status: res.statusCode, error: true });
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ "${query}": ${error.message}`);
      reject({ query, error: error.message });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      console.error(`⏰ "${query}": timeout after 10s`);
      reject({ query, error: 'timeout' });
    });
  });
};

const warmup = async () => {
  console.log(`🔥 Starting warmup against ${ORIGIN}`);
  console.log(`📊 Running ${HOT_QUERIES.length} hot queries...`);
  
  const startTime = Date.now();
  const results = [];
  
  try {
    // Execute all queries concurrently for faster warmup
    const promises = HOT_QUERIES.map(query => 
      makeRequest(query).catch(err => ({ ...err, error: true }))
    );
    
    const responses = await Promise.all(promises);
    results.push(...responses);
    
    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    
    console.log(`\n🏁 Warmup completed in ${totalTime}ms`);
    console.log(`✅ Successful: ${successful}/${HOT_QUERIES.length}`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed}/${HOT_QUERIES.length}`);
    }
    
    // Success if majority of queries succeeded
    if (successful >= HOT_QUERIES.length * 0.7) {
      console.log(`🎉 Warmup successful! API is ready.`);
      process.exit(0);
    } else {
      console.error(`💥 Warmup failed - too many errors (${failed}/${HOT_QUERIES.length})`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`💥 Warmup crashed:`, error);
    process.exit(1);
  }
};

// Add User-Agent for analytics filtering as mentioned in CLAUDE.md
const originalGet = http.get;
const originalHttpsGet = https.get;

const addUserAgent = (options) => {
  if (typeof options === 'string') {
    options = new URL(options);
  }
  options.headers = options.headers || {};
  options.headers['User-Agent'] = 'BuzzGrades-Warmup/1.0';
  return options;
};

http.get = (options, callback) => originalGet(addUserAgent(options), callback);
https.get = (options, callback) => originalHttpsGet(addUserAgent(options), callback);

if (require.main === module) {
  warmup();
}

module.exports = { warmup, HOT_QUERIES };