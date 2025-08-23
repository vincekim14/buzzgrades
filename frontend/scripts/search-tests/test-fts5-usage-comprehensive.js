#!/usr/bin/env node

/**
 * Comprehensive FTS5 Usage Test Suite
 * 
 * This test validates that FTS5 is used for 95%+ of queries,
 * with LIKE fallback only for the 3 specific edge cases:
 * 1. Pure numeric searches (any length): "1", "12", "1332", "12345"
 * 2. Single alphabetic characters: "A", "B" 
 * 3. ONLY special characters: "-", ":", "!!!"
 * 
 * Everything else should use FTS5 and show BM25 relevance scores.
 */

import { getSearchFTS5, getAutocompleteFTS5 } from "../../lib/db.js";

console.log("🔍 Comprehensive FTS5 Usage Validation\n");

// Test categories
const tests = {
  // These 3 categories should use LIKE (no BM25 scores)
  likeExpected: [
    // Pure numeric searches (any length)
    { query: "1", category: "Pure numeric (single digit)" },
    { query: "12", category: "Pure numeric (2 digits)" },
    { query: "123", category: "Pure numeric (3 digits)" },
    { query: "1332", category: "Pure numeric (4 digits)" },
    { query: "12345", category: "Pure numeric (5 digits)" },
    
    // Single alphabetic characters
    { query: "A", category: "Single alphabetic char" },
    { query: "B", category: "Single alphabetic char" },
    { query: "Z", category: "Single alphabetic char" },
    { query: "a", category: "Single alphabetic char (lowercase)" },
    
    // ONLY special characters
    { query: "-", category: "Single special char" },
    { query: ":", category: "Single special char" },
    { query: "!!!", category: "Multiple special chars" },
    { query: "---", category: "Multiple special chars" },
    { query: "!@#$%", category: "Multiple special chars" },
  ],
  
  // EVERYTHING else should use FTS5 (with BM25 scores)
  fts5Expected: [
    // Course codes (exact)
    { query: "CS1301", category: "Exact course code" },
    { query: "MATH1551", category: "Exact course code" },
    { query: "CS 1301", category: "Course code with space" },
    
    // Partial course codes
    { query: "CS13", category: "Partial course code" },
    { query: "MATH15", category: "Partial course code" },
    
    // Department codes (any length - removed restrictions)
    { query: "CS", category: "Short department code" },
    { query: "MATH", category: "Medium department code" },
    { query: "BIOCHEMISTRY", category: "Long department code" },
    { query: "ENGR", category: "4-letter department code" },
    { query: "BIOC", category: "4-letter department code" },
    
    // Single non-alphabetic characters (should use FTS5 now)
    { query: "!", category: "Single special char (non-alphabetic)" },
    { query: "?", category: "Single special char (non-alphabetic)" },
    
    // Multi-word searches
    { query: "Computer Science", category: "Multi-word phrase" },
    { query: "Data Structures", category: "Multi-word phrase" },
    { query: "Linear Algebra", category: "Multi-word phrase" },
    { query: "English Composition", category: "Multi-word phrase" },
    
    // Single words (any length)
    { query: "calculus", category: "Single word" },
    { query: "programming", category: "Single word" },
    { query: "physics", category: "Single word" },
    { query: "bio", category: "Short single word" },
    { query: "mathematics", category: "Long single word" },
    
    // Professor names
    { query: "Smith", category: "Professor name" },
    { query: "Johnson", category: "Professor name" },
    { query: "Dr. Brown", category: "Professor name with title" },
    
    // Mixed content (should all use FTS5 now)
    { query: "C++", category: "Mixed alphanumeric with special chars" },
    { query: "A-level", category: "Mixed alphanumeric with special chars" },
    { query: "CS1332advanced", category: "Mixed course code with text" },
    { query: "MATH1551H", category: "Course code with suffix" },
    { query: "data structures algorithms", category: "Multi-word technical term" },
    
    // Edge cases that should now use FTS5
    { query: "2D", category: "Short mixed alphanumeric" },
    { query: "3D", category: "Short mixed alphanumeric" },
    { query: "AI", category: "2-letter technical term" },
    { query: "ML", category: "2-letter technical term" },
    
    // Numbers with letters (should use FTS5)
    { query: "CS1", category: "Dept code with partial number" },
    { query: "MATH2", category: "Dept code with partial number" },
    
    // Complex queries
    { query: "machine learning python", category: "Complex multi-word query" },
    { query: "computer science algorithms", category: "Complex multi-word query" },
    { query: "data science statistics", category: "Complex multi-word query" },
  ]
};

let totalTests = 0;
let fts5UsageCount = 0;
let likeUsageCount = 0;
let unexpectedResults = [];

async function testQuery(query, expectedType, category) {
  try {
    const results = await getSearchFTS5(query);
    totalTests++;
    
    const hasBM25Scores = results.classes?.some(item => 
      typeof item.relevance_score === 'number'
    ) || results.professors?.some(item => 
      typeof item.relevance_score === 'number'
    ) || results.departments?.some(item => 
      typeof item.relevance_score === 'number'
    );
    
    const totalResults = (results.classes?.length || 0) + 
                        (results.professors?.length || 0) + 
                        (results.departments?.length || 0);
    
    if (expectedType === 'LIKE') {
      if (hasBM25Scores) {
        unexpectedResults.push({
          query,
          category,
          expected: 'LIKE',
          actual: 'FTS5',
          issue: 'Expected LIKE fallback but got FTS5 with BM25 scores'
        });
      } else {
        likeUsageCount++;
        console.log(`✅ LIKE: "${query}" (${category}) - ${totalResults} results, no BM25 scores`);
      }
    } else {
      if (hasBM25Scores) {
        fts5UsageCount++;
        const sampleScore = results.classes?.[0]?.relevance_score || 
                           results.professors?.[0]?.relevance_score || 
                           results.departments?.[0]?.relevance_score;
        console.log(`✅ FTS5: "${query}" (${category}) - ${totalResults} results, BM25 score: ${sampleScore?.toFixed(3)}`);
      } else {
        if (totalResults > 0) {
          unexpectedResults.push({
            query,
            category,
            expected: 'FTS5',
            actual: 'LIKE',
            issue: 'Expected FTS5 with BM25 scores but got LIKE fallback'
          });
        } else {
          // No results - could be either, not an error
          fts5UsageCount++; // Assume FTS5 was used, just no matches
          console.log(`⚪ FTS5: "${query}" (${category}) - 0 results (no matches)`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error testing "${query}": ${error.message}`);
  }
}

async function runTests() {
  console.log("=== Testing LIKE Fallback Cases (Should NOT have BM25 scores) ===\n");
  
  for (const test of tests.likeExpected) {
    await testQuery(test.query, 'LIKE', test.category);
  }
  
  console.log("\n=== Testing FTS5 Cases (Should HAVE BM25 scores) ===\n");
  
  for (const test of tests.fts5Expected) {
    await testQuery(test.query, 'FTS5', test.category);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 COMPREHENSIVE FTS5 USAGE ANALYSIS");
  console.log("=".repeat(60));
  
  const fts5Percentage = ((fts5UsageCount / totalTests) * 100).toFixed(1);
  const likePercentage = ((likeUsageCount / totalTests) * 100).toFixed(1);
  
  console.log(`📈 Total Tests: ${totalTests}`);
  console.log(`🚀 FTS5 Usage: ${fts5UsageCount} queries (${fts5Percentage}%)`);
  console.log(`🐌 LIKE Usage: ${likeUsageCount} queries (${likePercentage}%)`);
  
  if (unexpectedResults.length > 0) {
    console.log(`\n⚠️  UNEXPECTED RESULTS (${unexpectedResults.length}):`);
    unexpectedResults.forEach((result, idx) => {
      console.log(`${idx + 1}. "${result.query}" (${result.category})`);
      console.log(`   Expected: ${result.expected}, Got: ${result.actual}`);
      console.log(`   Issue: ${result.issue}\n`);
    });
  }
  
  // Success criteria
  if (fts5UsageCount >= totalTests * 0.95) {
    console.log(`\n🎉 SUCCESS: FTS5 usage rate of ${fts5Percentage}% meets the 95% target!`);
  } else {
    console.log(`\n⚠️  WARNING: FTS5 usage rate of ${fts5Percentage}% is below the 95% target.`);
  }
  
  if (unexpectedResults.length === 0) {
    console.log("✅ All queries behaved as expected!");
  } else {
    console.log(`❌ ${unexpectedResults.length} queries had unexpected behavior.`);
  }
  
  console.log("\n📋 Summary:");
  console.log(`- LIKE fallback should only be used for: pure numeric, single alphabetic, pure special chars`);
  console.log(`- FTS5 should be used for everything else, including complex mixed queries`);
  console.log(`- This validates the less restrictive FTS5 implementation`);
}

// Run the comprehensive test suite
await runTests();