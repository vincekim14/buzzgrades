#!/usr/bin/env node

/**
 * FTS5 Performance Test Script
 * 
 * This script tests FTS5 vs LIKE query performance.
 */

import { getSearchFTS5, getSearchOptimized, getAutocompleteFTS5, getAutocomplete } from "../lib/db.js";

console.log("🧪 Testing FTS5 Performance vs LIKE Queries\n");

const testQueries = [
  "CS",
  "CS1301", 
  "Math",
  "John",
  "Computer Science",
  "Engineering"
];

console.log("=== AUTOCOMPLETE PERFORMANCE ===");
for (const query of testQueries) {
  console.log(`\nTesting query: "${query}"`);
  
  // Test FTS5 autocomplete
  const fts5Start = Date.now();
  const fts5Results = await getAutocompleteFTS5(query);
  const fts5End = Date.now();
  
  // Test LIKE autocomplete  
  const likeStart = Date.now();
  const likeResults = await getAutocomplete(query);
  const likeEnd = Date.now();
  
  console.log(`FTS5: ${fts5End - fts5Start}ms (${fts5Results.courses.length + fts5Results.professors.length + fts5Results.departments.length} results)`);
  console.log(`LIKE: ${likeEnd - likeStart}ms (${likeResults.courses.length + likeResults.professors.length + likeResults.departments.length} results)`);
  
  if ((fts5End - fts5Start) < (likeEnd - likeStart)) {
    const speedup = ((likeEnd - likeStart) / (fts5End - fts5Start)).toFixed(1);
    console.log(`✅ FTS5 is ${speedup}x faster!`);
  }
}

console.log("\n=== FULL SEARCH PERFORMANCE ===");
for (const query of testQueries) {
  console.log(`\nTesting query: "${query}"`);
  
  // Test FTS5 search
  const fts5Start = Date.now();
  const fts5Results = await getSearchFTS5(query);
  const fts5End = Date.now();
  
  // Test LIKE search
  const likeStart = Date.now();
  const likeResults = await getSearchOptimized(query);
  const likeEnd = Date.now();
  
  console.log(`FTS5: ${fts5End - fts5Start}ms (${fts5Results.classes.length + fts5Results.professors.length + fts5Results.departments.length} results)`);
  console.log(`LIKE: ${likeEnd - likeStart}ms (${likeResults.classes.length + likeResults.professors.length + likeResults.departments.length} results)`);
  
  if ((fts5End - fts5Start) < (likeEnd - likeStart)) {
    const speedup = ((likeEnd - likeStart) / (fts5End - fts5Start)).toFixed(1);
    console.log(`✅ FTS5 is ${speedup}x faster!`);
  }
}

console.log("\n🎉 Performance testing complete!");