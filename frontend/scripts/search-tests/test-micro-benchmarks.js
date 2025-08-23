#!/usr/bin/env node

/**
 * Comprehensive Micro-Benchmark Suite
 * 
 * This script provides detailed performance analysis of FTS5 vs LIKE
 * for different query types to validate the FTS5-first hypothesis.
 * 
 * Tests:
 * - Statistical analysis with multiple runs
 * - Memory usage profiling  
 * - Cache impact measurement
 * - Query type classification
 * - Error scenario handling
 */

import { getSearchFTS5, getSearchOptimized, getAutocompleteFTS5, getAutocomplete } from "../../lib/db.js";
import { performance } from "perf_hooks";
import process from "process";

console.log("🔬 Comprehensive Micro-Benchmark Suite");
console.log("=====================================\n");

// Helper to get precise memory usage
const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB with precision
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
    external: Math.round(usage.external / 1024 / 1024 * 100) / 100
  };
};

// Statistical analysis helper
const calculateStats = (times) => {
  if (times.length === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
  
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted.length % 2 === 0 
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  
  const variance = times.reduce((acc, time) => acc + Math.pow(time - mean, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean: Math.round(mean * 1000) / 1000,
    median: Math.round(median * 1000) / 1000, 
    stdDev: Math.round(stdDev * 1000) / 1000,
    min: Math.round(sorted[0] * 1000) / 1000,
    max: Math.round(sorted[sorted.length - 1] * 1000) / 1000
  };
};

// Georgia Tech specific test queries categorized by scope
const queryCategories = {
  exactCourses: {
    name: "Exact Course Codes (Limited Scope)",
    description: "Should strongly favor FTS5 - exact matching with 4,861 total courses",
    queries: ["CS1301", "CS1331", "CS1332", "MATH1551", "MATH1552", "PHYS2211", "ECE2031", "BIOL1107", "CHEM1310", "ENGL1101"],
    expectedWinner: "FTS5",
    reasoning: "Limited dataset, exact matching, BM25 not critical but FTS5 indexing should win"
  },
  
  departmentPrefixes: {
    name: "Department Prefixes (Very Limited Scope)", 
    description: "Should STRONGLY favor FTS5 - only 90 possible departments",
    queries: ["CS", "MATH", "ECE", "PHYS", "BIOL", "CHEM", "ENGL", "HIST", "ECON", "ISYE"],
    expectedWinner: "FTS5", 
    reasoning: "Tiny dataset (90 depts), prefix matching optimized in FTS5"
  },
  
  partialCourses: {
    name: "Partial Course Codes (Limited Scope)",
    description: "Should favor FTS5 - limited combinations, prefix matching",
    queries: ["CS13", "CS33", "MATH15", "MATH25", "ECE20", "ECE30", "PHYS22", "BIOL11", "CHEM13", "ENGL11"],
    expectedWinner: "FTS5",
    reasoning: "Limited combinations, FTS5 prefix search (CS13*) should beat LIKE patterns"
  },
  
  departmentNames: {
    name: "Department Names (Very Limited Scope)",
    description: "Should STRONGLY favor FTS5 - only 90 possible department names",
    queries: ["Computer Science", "Mathematics", "Electrical Engineering", "Physics", "Chemistry", "Biology", "English", "History", "Economics", "Psychology"],
    expectedWinner: "FTS5",
    reasoning: "Tiny dataset (90 names), phrase matching, BM25 provides better ranking"
  },
  
  professorNames: {
    name: "Professor Names (Unlimited Scope)", 
    description: "Should favor FTS5 - 4,358 professors, BM25 ranking valuable",
    queries: ["Smith", "Johnson", "Brown", "Davis", "Wilson", "Miller", "Taylor", "Anderson", "Thomas", "Jackson"],
    expectedWinner: "FTS5",
    reasoning: "Large dataset, BM25 relevance scoring helps with ranking by RMP score integration"
  },
  
  courseTitles: {
    name: "Course Titles (Unlimited Scope)",
    description: "Should strongly favor FTS5 - thousands of titles, phrase search, relevance critical",
    queries: ["Linear Algebra", "Organic Chemistry", "Computer Graphics", "Data Structures", "Calculus", "Physics Laboratory", "English Composition", "Introduction Programming", "Machine Learning", "Digital Logic"],
    expectedWinner: "FTS5", 
    reasoning: "Complex text search, phrase matching, BM25 relevance crucial for finding right courses"
  },

  shortQueries: {
    name: "Very Short Queries (Edge Cases)",
    description: "Might favor LIKE - very short queries where FTS5 overhead not worth it", 
    queries: ["A", "B", "C", "1", "2", "3"],
    expectedWinner: "LIKE",
    reasoning: "Overhead of FTS5 processing might not be worth it for single characters"
  },
  
  mixedQueries: {
    name: "Mixed Multi-Word Queries", 
    description: "Should favor FTS5 - complex text search with multiple terms",
    queries: ["CS programming", "math calculus", "intro biology", "organic chem", "physics lab", "english composition", "machine learning AI", "data science"],
    expectedWinner: "FTS5",
    reasoning: "Multi-word search, phrase matching, relevance ranking critical"
  }
};

// Perform statistical benchmarking for a query category
const benchmarkCategory = async (categoryName, categoryData, runs = 20) => {
  console.log(`\n🔍 Testing: ${categoryData.name}`);
  console.log(`📝 ${categoryData.description}`);
  console.log(`🎯 Expected Winner: ${categoryData.expectedWinner}`);
  console.log(`💡 Reasoning: ${categoryData.reasoning}`);
  console.log("─".repeat(80));

  const results = {
    fts5: { times: [], totalResults: [], errors: 0 },
    like: { times: [], totalResults: [], errors: 0 },
    category: categoryName
  };

  const memoryStart = getMemoryUsage();

  for (const query of categoryData.queries) {
    console.log(`\n   Testing Query: "${query}"`);
    
    // Multiple runs for statistical significance
    const fts5Times = [];
    const likeTimes = [];
    let fts5ResultCount = 0;
    let likeResultCount = 0;

    for (let run = 0; run < runs; run++) {
      try {
        // Test FTS5 approach
        const fts5Start = performance.now();
        const fts5Results = await getSearchFTS5(query);
        const fts5End = performance.now();
        const fts5Time = fts5End - fts5Start;
        fts5Times.push(fts5Time);
        
        if (run === 0) { // Count results from first run
          fts5ResultCount = (fts5Results.classes?.length || 0) + (fts5Results.professors?.length || 0) + (fts5Results.departments?.length || 0);
        }

        // Test LIKE approach  
        const likeStart = performance.now();
        const likeResults = await getSearchOptimized(query);
        const likeEnd = performance.now();
        const likeTime = likeEnd - likeStart;
        likeTimes.push(likeTime);
        
        if (run === 0) { // Count results from first run
          likeResultCount = (likeResults.classes?.length || 0) + (likeResults.professors?.length || 0) + (likeResults.departments?.length || 0);
        }

      } catch (error) {
        console.log(`     ❌ Error on run ${run + 1}: ${error.message}`);
        if (error.message.includes("FTS5")) {
          results.fts5.errors++;
        } else {
          results.like.errors++;
        }
      }
    }

    // Calculate statistics
    const fts5Stats = calculateStats(fts5Times);
    const likeStats = calculateStats(likeTimes);
    
    results.fts5.times.push(...fts5Times);
    results.like.times.push(...likeTimes);
    results.fts5.totalResults.push(fts5ResultCount);
    results.like.totalResults.push(likeResultCount);

    // Report results for this query
    console.log(`     📊 FTS5: ${fts5Stats.mean}ms avg (±${fts5Stats.stdDev}ms) | ${fts5ResultCount} results`);
    console.log(`     📊 LIKE: ${likeStats.mean}ms avg (±${likeStats.stdDev}ms) | ${likeResultCount} results`);
    
    if (fts5Stats.mean < likeStats.mean) {
      const speedup = (likeStats.mean / fts5Stats.mean).toFixed(1);
      console.log(`     ✅ FTS5 winner: ${speedup}x faster`);
    } else {
      const speedup = (fts5Stats.mean / likeStats.mean).toFixed(1);  
      console.log(`     ⚠️  LIKE winner: ${speedup}x faster`);
    }

    // Check result consistency
    if (Math.abs(fts5ResultCount - likeResultCount) > 2) {
      console.log(`     🔄 Result difference: FTS5=${fts5ResultCount}, LIKE=${likeResultCount}`);
    }
  }

  const memoryEnd = getMemoryUsage();
  const memoryDelta = memoryEnd.heapUsed - memoryStart.heapUsed;

  // Overall category statistics
  const overallFts5Stats = calculateStats(results.fts5.times);
  const overallLikeStats = calculateStats(results.like.times);
  
  console.log(`\n📈 ${categoryData.name} - Overall Results:`);
  console.log(`   FTS5: ${overallFts5Stats.mean}ms avg (${overallFts5Stats.min}-${overallFts5Stats.max}ms range, σ=${overallFts5Stats.stdDev})`);
  console.log(`   LIKE: ${overallLikeStats.mean}ms avg (${overallLikeStats.min}-${overallLikeStats.max}ms range, σ=${overallLikeStats.stdDev})`);
  console.log(`   Memory Impact: ${memoryDelta > 0 ? '+' : ''}${memoryDelta}MB`);
  console.log(`   Error Rates: FTS5=${results.fts5.errors}, LIKE=${results.like.errors}`);
  
  if (overallFts5Stats.mean < overallLikeStats.mean) {
    const speedup = (overallLikeStats.mean / overallFts5Stats.mean).toFixed(1);
    console.log(`   🏆 Winner: FTS5 (${speedup}x faster) - ${categoryData.expectedWinner === 'FTS5' ? '✅ As Expected' : '❌ Unexpected'}`);
  } else {
    const speedup = (overallFts5Stats.mean / overallLikeStats.mean).toFixed(1);
    console.log(`   🏆 Winner: LIKE (${speedup}x faster) - ${categoryData.expectedWinner === 'LIKE' ? '✅ As Expected' : '❌ Unexpected'}`);
  }

  return {
    category: categoryName,
    expectedWinner: categoryData.expectedWinner,
    actualWinner: overallFts5Stats.mean < overallLikeStats.mean ? 'FTS5' : 'LIKE',
    speedup: overallFts5Stats.mean < overallLikeStats.mean 
      ? (overallLikeStats.mean / overallFts5Stats.mean) 
      : (overallFts5Stats.mean / overallLikeStats.mean),
    fts5Stats: overallFts5Stats,
    likeStats: overallLikeStats,
    memoryImpact: memoryDelta,
    errors: { fts5: results.fts5.errors, like: results.like.errors }
  };
};

// Main benchmarking function
const runMicroBenchmarks = async () => {
  console.log("🚀 Starting Comprehensive Micro-Benchmarks");
  console.log(`🔬 Running ${20} statistical runs per query for reliability`);
  console.log(`💾 Initial Memory: ${getMemoryUsage().heapUsed}MB\n`);
  
  const startTime = performance.now();
  const initialMemory = getMemoryUsage();
  const categoryResults = [];

  // Test each category
  for (const [categoryName, categoryData] of Object.entries(queryCategories)) {
    const result = await benchmarkCategory(categoryName, categoryData, 20);
    categoryResults.push(result);
    
    // Brief pause to allow garbage collection
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const endTime = performance.now();
  const finalMemory = getMemoryUsage();
  
  // Summary Report
  console.log("\n" + "=".repeat(80));
  console.log("📊 COMPREHENSIVE MICRO-BENCHMARK SUMMARY");  
  console.log("=".repeat(80));
  
  let fts5Wins = 0;
  let likeWins = 0;
  let expectedCorrect = 0;
  
  categoryResults.forEach(result => {
    const winnerIcon = result.actualWinner === 'FTS5' ? '🚀' : '🐌';
    const expectedIcon = result.actualWinner === result.expectedWinner ? '✅' : '❌';
    
    console.log(`${winnerIcon} ${result.category.padEnd(25)} | ${result.actualWinner.padEnd(4)} wins by ${result.speedup.toFixed(1)}x | ${expectedIcon}`);
    
    if (result.actualWinner === 'FTS5') fts5Wins++;
    else likeWins++;
    
    if (result.actualWinner === result.expectedWinner) expectedCorrect++;
  });

  const totalCategories = categoryResults.length;
  const predictionAccuracy = (expectedCorrect / totalCategories * 100).toFixed(1);

  console.log("\n📈 Key Findings:");
  console.log(`   • FTS5 won: ${fts5Wins}/${totalCategories} categories (${(fts5Wins/totalCategories*100).toFixed(1)}%)`);
  console.log(`   • LIKE won: ${likeWins}/${totalCategories} categories (${(likeWins/totalCategories*100).toFixed(1)}%)`);  
  console.log(`   • Prediction accuracy: ${predictionAccuracy}% (${expectedCorrect}/${totalCategories} correct)`);
  console.log(`   • Total benchmark time: ${((endTime - startTime)/1000).toFixed(1)}s`);
  console.log(`   • Memory impact: ${finalMemory.heapUsed - initialMemory.heapUsed > 0 ? '+' : ''}${(finalMemory.heapUsed - initialMemory.heapUsed).toFixed(1)}MB`);

  // Recommendations
  console.log("\n💡 Recommendations:");
  
  if (fts5Wins >= totalCategories * 0.7) {
    console.log("   🚀 STRONG RECOMMENDATION: Implement FTS5-First Approach");
    console.log("      - FTS5 wins majority of categories");
    console.log("      - Remove conservative fallback logic");
    console.log("      - Optimize for FTS5 across the board");
  } else if (fts5Wins >= totalCategories * 0.4) {
    console.log("   ⚖️  MIXED RECOMMENDATION: Hybrid Approach Optimal");
    console.log("      - Use FTS5 for categories where it wins");
    console.log("      - Keep LIKE for categories where it wins");
    console.log("      - Smart routing based on query type");
  } else {
    console.log("   🐌 CONSERVATIVE RECOMMENDATION: Keep Current LIKE-Heavy Approach");
    console.log("      - LIKE wins majority of categories");
    console.log("      - Current conservative fallbacks are justified");
    console.log("      - Focus on LIKE optimizations instead");
  }

  // Technical insights
  console.log("\n🔧 Technical Insights:");
  const totalErrors = categoryResults.reduce((sum, r) => sum + r.errors.fts5 + r.errors.like, 0);
  if (totalErrors > 0) {
    console.log(`   ⚠️  Error rates detected - investigate reliability issues`);
  } else {
    console.log(`   ✅ No errors detected - both approaches stable`);
  }

  const avgMemoryImpact = categoryResults.reduce((sum, r) => sum + r.memoryImpact, 0) / categoryResults.length;
  if (avgMemoryImpact > 10) {
    console.log(`   💾 High memory impact (${avgMemoryImpact.toFixed(1)}MB avg) - monitor production usage`);
  } else {
    console.log(`   💾 Acceptable memory impact (${avgMemoryImpact.toFixed(1)}MB avg)`);
  }

  return categoryResults;
};

// Execute benchmarks
runMicroBenchmarks().catch(console.error);