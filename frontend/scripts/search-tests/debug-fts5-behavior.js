#!/usr/bin/env node

/**
 * Debug FTS5 Behavior Analysis
 * 
 * This script investigates why FTS5 is performing poorly
 * and whether the fallback logic is actually being bypassed.
 */

import { getSearchFTS5, getSearchOptimized } from "../../lib/db.js";
import { performance } from "perf_hooks";

console.log("🔍 FTS5 Behavior Debug Analysis\n");

// Test queries that showed unexpected results
const testQueries = [
  { query: "CS", category: "Department Prefix", expected: "Should use FTS5" },
  { query: "MATH", category: "Department Prefix", expected: "Should use FTS5" },
  { query: "Smith", category: "Professor Name", expected: "Should use FTS5" },
  { query: "CS13", category: "Partial Course", expected: "Should use FTS5" },
  { query: "Computer Science", category: "Department Name", expected: "Should use FTS5" },
  { query: "CS1301", category: "Exact Course", expected: "Should use FTS5" }
];

// Helper to detect if FTS5 was actually used
const hasBM25Scores = (results) => {
  // Check if any results have relevance_score (BM25 indicator)
  const checkArray = (arr) => {
    return arr && arr.some(item => 
      item.relevance_score !== undefined || 
      (typeof item.relevance_score === 'number' && item.relevance_score < 0)
    );
  };
  
  return checkArray(results.classes) || 
         checkArray(results.professors) || 
         checkArray(results.departments);
};

const analyzeQuery = async (queryData) => {
  console.log(`\n🔍 Analyzing: "${queryData.query}" (${queryData.category})`);
  console.log(`   Expected: ${queryData.expected}`);
  
  try {
    // Test FTS5 path
    const fts5Start = performance.now();
    const fts5Results = await getSearchFTS5(queryData.query);
    const fts5End = performance.now();
    const fts5Time = fts5End - fts5Start;
    
    // Test LIKE path
    const likeStart = performance.now();
    const likeResults = await getSearchOptimized(queryData.query);
    const likeEnd = performance.now();
    const likeTime = likeEnd - likeStart;
    
    // Analyze results
    const fts5Total = (fts5Results.classes?.length || 0) + 
                     (fts5Results.professors?.length || 0) + 
                     (fts5Results.departments?.length || 0);
    
    const likeTotal = (likeResults.classes?.length || 0) + 
                     (likeResults.professors?.length || 0) + 
                     (likeResults.departments?.length || 0);
    
    const fts5Used = hasBM25Scores(fts5Results);
    const likeUsed = hasBM25Scores(likeResults);
    
    console.log(`   📊 Results:`);
    console.log(`      FTS5: ${fts5Time.toFixed(3)}ms, ${fts5Total} items, BM25 scores: ${fts5Used ? '✅' : '❌'}`);
    console.log(`      LIKE: ${likeTime.toFixed(3)}ms, ${likeTotal} items, BM25 scores: ${likeUsed ? '✅' : '❌'}`);
    
    // Performance analysis
    if (fts5Time < likeTime) {
      console.log(`   ✅ FTS5 faster by ${(likeTime / fts5Time).toFixed(1)}x`);
    } else {
      console.log(`   ❌ LIKE faster by ${(fts5Time / likeTime).toFixed(1)}x`);
    }
    
    // Check if FTS5 actually ran FTS5 queries
    if (!fts5Used) {
      console.log(`   🚨 WARNING: getSearchFTS5() did NOT use FTS5 - fell back to LIKE!`);
      
      // Sample a few results to see structure
      if (fts5Results.classes && fts5Results.classes.length > 0) {
        const sample = fts5Results.classes[0];
        const hasRelevance = sample.relevance_score !== undefined;
        const hasFuzzy = sample.fuzzyScore !== undefined;
        console.log(`      Sample result keys: ${Object.keys(sample).join(', ')}`);
        console.log(`      Has relevance_score: ${hasRelevance}`);
        console.log(`      Has fuzzyScore: ${hasFuzzy}`);
      }
    } else {
      console.log(`   ✅ FTS5 actually used - BM25 scores present`);
      
      // Show BM25 scores
      if (fts5Results.classes && fts5Results.classes.length > 0) {
        const sample = fts5Results.classes[0];
        if (sample.relevance_score !== undefined) {
          console.log(`      Sample BM25 score: ${sample.relevance_score}`);
        }
      }
    }
    
    // Result consistency check
    if (Math.abs(fts5Total - likeTotal) > 2) {
      console.log(`   ⚠️  Result count difference: FTS5=${fts5Total}, LIKE=${likeTotal}`);
    }
    
    return {
      query: queryData.query,
      category: queryData.category,
      fts5Time,
      likeTime,
      fts5Used,
      fts5Total,
      likeTotal,
      actuallyUsedFTS5: fts5Used
    };
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
};

const runDebugAnalysis = async () => {
  console.log("🚀 Starting FTS5 Behavior Debug Analysis\n");
  
  const results = [];
  
  for (const queryData of testQueries) {
    const result = await analyzeQuery(queryData);
    if (result) results.push(result);
  }
  
  // Summary analysis
  console.log("\n" + "=".repeat(60));
  console.log("📊 DEBUG ANALYSIS SUMMARY");
  console.log("=".repeat(60));
  
  const actualFts5Count = results.filter(r => r.actuallyUsedFTS5).length;
  const totalQueries = results.length;
  
  console.log(`\n🔍 FTS5 Usage Analysis:`);
  console.log(`   Queries that actually used FTS5: ${actualFts5Count}/${totalQueries} (${(actualFts5Count/totalQueries*100).toFixed(1)}%)`);
  
  results.forEach(result => {
    const icon = result.actuallyUsedFTS5 ? '🚀' : '🐌';
    const method = result.actuallyUsedFTS5 ? 'FTS5' : 'LIKE';
    console.log(`   ${icon} ${result.query.padEnd(15)} | ${method} | ${result.fts5Time.toFixed(3)}ms`);
  });
  
  if (actualFts5Count < totalQueries) {
    console.log(`\n🚨 CRITICAL FINDING: getSearchFTS5() is falling back to LIKE!`);
    console.log(`   This explains the poor FTS5 performance in benchmarks.`);
    console.log(`   The conservative fallback logic is being applied even when we explicitly call FTS5.`);
  } else {
    console.log(`\n✅ FTS5 is actually being used for all queries.`);
    console.log(`   The performance difference is due to FTS5 overhead, not fallback behavior.`);
  }
  
  return results;
};

// Execute debug analysis
runDebugAnalysis().catch(console.error);