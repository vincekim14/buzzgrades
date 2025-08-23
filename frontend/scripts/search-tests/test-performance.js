#!/usr/bin/env node

/**
 * Performance Benchmarking Test Script
 * 
 * Comprehensive performance tests including:
 * - FTS5 vs LIKE query timing comparisons
 * - Memory usage monitoring
 * - Concurrent query stress testing
 * - Cache performance impact
 * - Georgia Tech specific query patterns
 */

import { getSearchFTS5, getSearchOptimized, getAutocompleteFTS5, getAutocomplete } from "../../lib/db.js";
import { performance } from "perf_hooks";
import process from "process";

console.log("⚡ Performance Benchmarking Tests\n");

// Helper to get memory usage
const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
  };
};

// Georgia Tech specific test queries for realistic benchmarking
const performanceTestQueries = {
  exactCourses: [
    "CS1301", "CS1331", "CS1332", "MATH1551", "MATH1552", "PHYS2211", 
    "ECE2031", "BIOL1107", "CHEM1310", "ENGL1101", "HIST2111", "PSYC1101"
  ],
  
  departmentPrefixes: [
    "CS", "MATH", "ECE", "PHYS", "BIOL", "CHEM", "ENGL", "HIST", "PSYC", "ECON"
  ],
  
  partialCourses: [
    "CS13", "MATH15", "ECE20", "PHYS22", "BIOL11", "CHEM13"
  ],
  
  courseTitles: [
    "Introduction to Computer Science",
    "Linear Algebra", 
    "Organic Chemistry",
    "Privacy Tech Policy Law",
    "Introduction to Programming",
    "Calculus II",
    "Physics Laboratory",
    "General Biology",
    "English Composition",
    "Modern Physics"
  ],
  
  professorNames: [
    "Smith", "Johnson", "Brown", "Davis", "Wilson", "Miller", 
    "Taylor", "Anderson", "Thomas", "Jackson"
  ],
  
  mixedQueries: [
    "CS programming", "math calculus", "intro biology", "organic chem",
    "physics lab", "english composition", "computer graphics", "data structures"
  ]
};

// Benchmark individual query performance
const benchmarkQueryPerformance = async () => {
  console.log("=== INDIVIDUAL QUERY PERFORMANCE ===\n");
  
  const benchmarkResults = {};
  
  for (const [category, queries] of Object.entries(performanceTestQueries)) {
    console.log(`${category.toUpperCase()} Queries:`);
    benchmarkResults[category] = { fts5: [], like: [] };
    
    for (const query of queries.slice(0, 5)) { // Test first 5 of each category
      console.log(`   Testing: "${query}"`);
      
      // Warm up
      await getSearchFTS5(query);
      await getSearchOptimized(query);
      
      // FTS5 Performance
      const fts5Start = performance.now();
      const fts5Results = await getSearchFTS5(query);
      const fts5End = performance.now();
      const fts5Time = fts5End - fts5Start;
      
      // LIKE Performance
      const likeStart = performance.now();
      const likeResults = await getSearchOptimized(query);
      const likeEnd = performance.now();
      const likeTime = likeEnd - likeStart;
      
      benchmarkResults[category].fts5.push(fts5Time);
      benchmarkResults[category].like.push(likeTime);
      
      const fts5Total = fts5Results.classes.length + fts5Results.professors.length + fts5Results.departments.length;
      const likeTotal = likeResults.classes.length + likeResults.professors.length + likeResults.departments.length;
      
      console.log(`      FTS5: ${fts5Time.toFixed(1)}ms (${fts5Total} results)`);
      console.log(`      LIKE: ${likeTime.toFixed(1)}ms (${likeTotal} results)`);
      
      if (fts5Time < likeTime) {
        const speedup = (likeTime / fts5Time).toFixed(1);
        console.log(`      ✅ FTS5 is ${speedup}x faster`);
      } else {
        console.log(`      ⚠️  LIKE was faster (likely fallback behavior)`);
      }
      
      console.log("");
    }
    
    // Calculate averages for this category
    const avgFts5 = benchmarkResults[category].fts5.reduce((a, b) => a + b, 0) / benchmarkResults[category].fts5.length;
    const avgLike = benchmarkResults[category].like.reduce((a, b) => a + b, 0) / benchmarkResults[category].like.length;
    
    console.log(`   📊 ${category} Average:`);
    console.log(`      FTS5: ${avgFts5.toFixed(1)}ms`);
    console.log(`      LIKE: ${avgLike.toFixed(1)}ms`);
    if (avgFts5 < avgLike) {
      console.log(`      Overall speedup: ${(avgLike / avgFts5).toFixed(1)}x faster with FTS5`);
    }
    console.log("");
  }
  
  return benchmarkResults;
};

// Test autocomplete performance
const benchmarkAutocompletePerformance = async () => {
  console.log("=== AUTOCOMPLETE PERFORMANCE ===\n");
  
  const autocompleteQueries = [
    "C", "CS", "CS1", "CS13", "Math", "M", "MA", "MAT", "MATH1",
    "E", "EC", "ECE", "P", "PH", "PHYS"
  ];
  
  const results = { fts5: [], like: [] };
  
  for (const query of autocompleteQueries) {
    console.log(`Autocomplete: "${query}"`);
    
    // Warm up
    await getAutocompleteFTS5(query);
    await getAutocomplete(query);
    
    // FTS5 Autocomplete
    const fts5Start = performance.now();
    const fts5Results = await getAutocompleteFTS5(query);
    const fts5End = performance.now();
    const fts5Time = fts5End - fts5Start;
    
    // LIKE Autocomplete
    const likeStart = performance.now();
    const likeResults = await getAutocomplete(query);
    const likeEnd = performance.now();
    const likeTime = likeEnd - likeStart;
    
    results.fts5.push(fts5Time);
    results.like.push(likeTime);
    
    const fts5Total = fts5Results.courses.length + fts5Results.professors.length + fts5Results.departments.length;
    const likeTotal = likeResults.courses.length + likeResults.professors.length + likeResults.departments.length;
    
    console.log(`   FTS5: ${fts5Time.toFixed(1)}ms (${fts5Total} results)`);
    console.log(`   LIKE: ${likeTime.toFixed(1)}ms (${likeTotal} results)`);
    
    if (fts5Time < likeTime) {
      console.log(`   ✅ FTS5 ${(likeTime / fts5Time).toFixed(1)}x faster`);
    }
    console.log("");
  }
  
  const avgFts5 = results.fts5.reduce((a, b) => a + b, 0) / results.fts5.length;
  const avgLike = results.like.reduce((a, b) => a + b, 0) / results.like.length;
  
  console.log(`📊 Autocomplete Averages:`);
  console.log(`   FTS5: ${avgFts5.toFixed(1)}ms`);
  console.log(`   LIKE: ${avgLike.toFixed(1)}ms`);
  if (avgFts5 < avgLike) {
    console.log(`   Overall autocomplete speedup: ${(avgLike / avgFts5).toFixed(1)}x faster\n`);
  }
};

// Test concurrent query performance
const benchmarkConcurrentPerformance = async () => {
  console.log("=== CONCURRENT QUERY STRESS TEST ===\n");
  
  const concurrentQueries = [
    "CS1301", "MATH1551", "ECE2031", "PHYS2211", "BIOL1107",
    "CS", "MATH", "ECE", "programming", "calculus"
  ];
  
  console.log(`Testing ${concurrentQueries.length} concurrent queries...`);
  
  const memoryBefore = getMemoryUsage();
  console.log(`Memory before: ${memoryBefore.heapUsed}MB`);
  
  const startTime = performance.now();
  
  // Run all queries concurrently
  const promises = concurrentQueries.map(async (query, index) => {
    const queryStart = performance.now();
    const results = await getSearchFTS5(query);
    const queryEnd = performance.now();
    
    return {
      query,
      index,
      time: queryEnd - queryStart,
      resultCount: results.classes.length + results.professors.length + results.departments.length
    };
  });
  
  const results = await Promise.all(promises);
  const endTime = performance.now();
  
  const memoryAfter = getMemoryUsage();
  console.log(`Memory after: ${memoryAfter.heapUsed}MB (${memoryAfter.heapUsed - memoryBefore.heapUsed > 0 ? '+' : ''}${memoryAfter.heapUsed - memoryBefore.heapUsed}MB)`);
  
  const totalTime = endTime - startTime;
  const averageTime = results.reduce((sum, result) => sum + result.time, 0) / results.length;
  
  console.log(`\n📊 Concurrent Performance Results:`);
  console.log(`   Total wall time: ${totalTime.toFixed(1)}ms`);
  console.log(`   Average query time: ${averageTime.toFixed(1)}ms`);
  console.log(`   Queries per second: ${(1000 / averageTime).toFixed(1)}`);
  console.log(`   Memory efficiency: ${memoryAfter.heapUsed - memoryBefore.heapUsed <= 10 ? '✅' : '⚠️'} ${memoryAfter.heapUsed - memoryBefore.heapUsed}MB increase`);
  
  // Show individual results
  results.forEach(result => {
    console.log(`   ${result.query}: ${result.time.toFixed(1)}ms (${result.resultCount} results)`);
  });
  
  console.log("");
};

// Test cache performance impact
const benchmarkCacheImpact = async () => {
  console.log("=== CACHE PERFORMANCE IMPACT ===\n");
  
  const cacheTestQueries = ["CS1301", "MATH1551", "ECE2031", "PHYS2211"];
  
  console.log("Testing cache impact with repeated queries...\n");
  
  for (const query of cacheTestQueries) {
    console.log(`Testing cache for: "${query}"`);
    
    // First run (cold cache)
    const cold1 = performance.now();
    await getSearchFTS5(query);
    const cold2 = performance.now();
    const coldTime = cold2 - cold1;
    
    // Second run (should be cached)
    const warm1 = performance.now();
    await getSearchFTS5(query);
    const warm2 = performance.now();
    const warmTime = warm2 - warm1;
    
    // Third run (definitely cached)
    const cached1 = performance.now();
    await getSearchFTS5(query);
    const cached2 = performance.now();
    const cachedTime = cached2 - cached1;
    
    console.log(`   Cold cache: ${coldTime.toFixed(1)}ms`);
    console.log(`   Warm cache: ${warmTime.toFixed(1)}ms`);
    console.log(`   Cached: ${cachedTime.toFixed(1)}ms`);
    
    if (cachedTime < coldTime * 0.8) {
      const improvement = (coldTime / cachedTime).toFixed(1);
      console.log(`   ✅ Cache working: ${improvement}x faster when cached`);
    } else {
      console.log(`   ⚠️  Cache improvement not clearly visible`);
    }
    
    console.log("");
  }
};

// Test performance under load
const benchmarkLoadPerformance = async () => {
  console.log("=== LOAD PERFORMANCE TEST ===\n");
  
  const loadQueries = [];
  
  // Generate a mix of realistic queries
  performanceTestQueries.exactCourses.forEach(q => loadQueries.push(q));
  performanceTestQueries.departmentPrefixes.forEach(q => loadQueries.push(q));
  performanceTestQueries.courseTitles.slice(0, 5).forEach(q => loadQueries.push(q));
  
  console.log(`Testing performance under load: ${loadQueries.length} queries in sequence...`);
  
  const memoryStart = getMemoryUsage();
  const times = [];
  
  const overallStart = performance.now();
  
  for (let i = 0; i < loadQueries.length; i++) {
    const query = loadQueries[i];
    
    const queryStart = performance.now();
    await getSearchFTS5(query);
    const queryEnd = performance.now();
    
    times.push(queryEnd - queryStart);
    
    // Log progress every 10 queries
    if ((i + 1) % 10 === 0) {
      console.log(`   Completed ${i + 1}/${loadQueries.length} queries...`);
    }
  }
  
  const overallEnd = performance.now();
  const memoryEnd = getMemoryUsage();
  
  const totalTime = overallEnd - overallStart;
  const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log(`\n📊 Load Test Results:`);
  console.log(`   Total time: ${totalTime.toFixed(1)}ms`);
  console.log(`   Average per query: ${averageTime.toFixed(1)}ms`);
  console.log(`   Min time: ${minTime.toFixed(1)}ms`);
  console.log(`   Max time: ${maxTime.toFixed(1)}ms`);
  console.log(`   Throughput: ${(1000 / averageTime).toFixed(1)} queries/second`);
  console.log(`   Memory usage: ${memoryEnd.heapUsed}MB (${memoryEnd.heapUsed - memoryStart.heapUsed > 0 ? '+' : ''}${memoryEnd.heapUsed - memoryStart.heapUsed}MB)`);
  
  // Performance consistency check
  const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length;
  const standardDeviation = Math.sqrt(variance);
  
  console.log(`   Performance consistency: ${(standardDeviation / averageTime * 100).toFixed(1)}% variance`);
  
  if (standardDeviation / averageTime < 0.5) {
    console.log(`   ✅ Consistent performance across queries`);
  } else {
    console.log(`   ⚠️  High variance in query performance`);
  }
  
  console.log("");
};

// Run comprehensive performance benchmarks
const runAllPerformanceTests = async () => {
  console.log("🚀 Starting comprehensive performance benchmarks...\n");
  
  const overallStart = performance.now();
  const memoryInitial = getMemoryUsage();
  
  console.log(`Initial memory usage: ${memoryInitial.heapUsed}MB\n`);
  
  await benchmarkQueryPerformance();
  await benchmarkAutocompletePerformance();
  await benchmarkConcurrentPerformance();
  await benchmarkCacheImpact();
  await benchmarkLoadPerformance();
  
  const overallEnd = performance.now();
  const memoryFinal = getMemoryUsage();
  
  console.log("🎉 Performance benchmarking complete!");
  console.log(`\n📋 Overall Performance Summary:`);
  console.log(`- Total benchmark time: ${(overallEnd - overallStart).toFixed(1)}ms`);
  console.log(`- Final memory usage: ${memoryFinal.heapUsed}MB (${memoryFinal.heapUsed - memoryInitial.heapUsed > 0 ? '+' : ''}${memoryFinal.heapUsed - memoryInitial.heapUsed}MB)`);
  console.log(`- ✅ FTS5 vs LIKE query performance comparison`);
  console.log(`- ✅ Autocomplete performance validation`);
  console.log(`- ✅ Concurrent query stress testing`);
  console.log(`- ✅ Cache performance impact analysis`);
  console.log(`- ✅ Load testing with performance consistency`);
};

// Execute performance tests
runAllPerformanceTests().catch(console.error);