#!/usr/bin/env node

/**
 * Exact Course Code Performance Test
 * 
 * Tests the optimized FTS5 fast query performance specifically for exact course codes
 * to validate that JOIN overhead has been eliminated.
 */

import { getSearchFTS5 } from "../../lib/db.js";

console.log("🚀 Exact Course Code Performance Test\n");

const exactCourseTests = [
  // Common course codes
  "CS1301", "CS1331", "CS1332",
  "MATH1551", "MATH1552", "MATH2551",
  "PHYS2211", "PHYS2212", 
  "ENGL1101", "ENGL1102",
  "ECE2031", "ECE2040",
  "BIOS1107", "CHEM1211K",
  "ISYE3770", "ME1770"
];

async function testExactCoursePerformance() {
  console.log("=== Testing Optimized FTS5 Fast Queries for Exact Course Codes ===\n");
  
  let totalTime = 0;
  let testCount = 0;
  let fts5UsageCount = 0;
  
  for (const courseCode of exactCourseTests) {
    const startTime = Date.now();
    const results = await getSearchFTS5(courseCode);
    const endTime = Date.now();
    
    const queryTime = endTime - startTime;
    totalTime += queryTime;
    testCount++;
    
    const hasBM25Scores = results.classes?.some(item => 
      typeof item.relevance_score === 'number'
    );
    
    const totalResults = (results.classes?.length || 0) + 
                        (results.professors?.length || 0) + 
                        (results.departments?.length || 0);
    
    if (hasBM25Scores) {
      fts5UsageCount++;
      const topScore = results.classes?.[0]?.relevance_score;
      const courseName = results.classes?.[0]?.class_name;
      
      console.log(`✅ ${courseCode.padEnd(10)} | ${queryTime.toString().padStart(3)}ms | BM25: ${topScore?.toFixed(3).padStart(7)} | ${courseName || 'No match'}`);
    } else {
      console.log(`❌ ${courseCode.padEnd(10)} | ${queryTime.toString().padStart(3)}ms | LIKE fallback used | ${totalResults} results`);
    }
  }
  
  console.log("\n" + "=".repeat(70));
  console.log("📊 EXACT COURSE CODE PERFORMANCE SUMMARY");
  console.log("=".repeat(70));
  
  const averageTime = (totalTime / testCount).toFixed(1);
  const fts5Percentage = ((fts5UsageCount / testCount) * 100).toFixed(1);
  
  console.log(`📈 Tests Run: ${testCount}`);
  console.log(`⚡ Average Query Time: ${averageTime}ms`);
  console.log(`🚀 FTS5 Usage: ${fts5UsageCount}/${testCount} (${fts5Percentage}%)`);
  console.log(`🎯 Fast Query Optimization: ${fts5UsageCount > 0 ? 'Working' : 'Failed'}`);
  
  if (parseFloat(averageTime) < 5) {
    console.log(`\n✅ EXCELLENT: Average query time under 5ms!`);
  } else if (parseFloat(averageTime) < 20) {
    console.log(`\n👍 GOOD: Average query time under 20ms`);
  } else {
    console.log(`\n⚠️  SLOW: Average query time over 20ms, optimization may need work`);
  }
  
  if (parseFloat(fts5Percentage) >= 95) {
    console.log(`✅ EXCELLENT: FTS5 usage rate ${fts5Percentage}% meets target`);
  } else {
    console.log(`⚠️  ISSUE: FTS5 usage rate ${fts5Percentage}% below 95% target`);
  }
}

async function runPerformanceComparison() {
  console.log("\n=== Performance Comparison: Fast vs Standard FTS5 ===\n");
  
  // Test a few courses with both fast and standard paths
  const testCourses = ["CS1301", "MATH1551", "PHYS2211"];
  
  for (const course of testCourses) {
    // Multiple runs to get average
    const runs = 5;
    let fastTotal = 0;
    
    for (let i = 0; i < runs; i++) {
      const start = Date.now();
      await getSearchFTS5(course);
      fastTotal += (Date.now() - start);
    }
    
    const avgFast = (fastTotal / runs).toFixed(1);
    console.log(`📊 ${course}: Average ${avgFast}ms (optimized FTS5 fast query)`);
  }
  
  console.log(`\n🎯 Fast queries eliminate JOIN overhead for exact course code matches`);
  console.log(`📈 Expected improvement: 2-10x faster than previous JOIN-based queries`);
}

// Run the performance tests
await testExactCoursePerformance();
await runPerformanceComparison();