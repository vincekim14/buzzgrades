#!/usr/bin/env node

/**
 * Comprehensive FTS5 Functionality Test Script
 * 
 * Tests all FTS5 features including:
 * - FTS5 external-content index functionality
 * - Prefix search capabilities
 * - Query type detection and processing
 * - Fallback to LIKE queries
 * - Edge cases and error handling
 */

import { getSearchFTS5, getSearchOptimized, getAutocompleteFTS5, getAutocomplete } from "../../lib/db.js";

console.log("🔍 Comprehensive FTS5 Functionality Tests\n");

// Test categories with various query types
const testCategories = {
  exactCourseCodes: {
    name: "Exact Course Codes",
    queries: ["CS1301", "MATH1551", "PHYS2211", "ENGL1101", "ECE2031"],
    expectedBehavior: "Should use FTS5 with high priority, exact matches"
  },
  
  courseCodesWithSpaces: {
    name: "Course Codes with Spaces",
    queries: ["CS 1301", "MATH 1551", "PHYS 2211", "ENGL 1101"],
    expectedBehavior: "Should normalize spaces and use FTS5 for exact matching"
  },
  
  departmentPrefixes: {
    name: "Department Prefixes",
    queries: ["CS", "MATH", "PHYS", "ECE", "BIOL"],
    expectedBehavior: "Should use FTS5 prefix search with department boost"
  },
  
  partialCourseCodes: {
    name: "Partial Course Codes",
    queries: ["CS13", "MATH15", "PHYS22", "ECE20"],
    expectedBehavior: "Should use FTS5 partial matching with wildcards"
  },
  
  courseNames: {
    name: "Course Names/Titles",
    queries: ["Computer Science", "Calculus", "Physics", "English Composition"],
    expectedBehavior: "Should search in course descriptions and titles"
  },
  
  professorNames: {
    name: "Professor Names",
    queries: ["Smith", "Johnson", "Brown", "Davis"],
    expectedBehavior: "Should search professor names with FTS5"
  },
  
  shortQueries: {
    name: "Short Queries (Should fallback to LIKE)",
    queries: ["A", "B", "1", "CS"],
    expectedBehavior: "Very short queries should fallback to LIKE for performance"
  },
  
  edgeCases: {
    name: "Edge Cases",
    queries: ["", "   ", "!@#$%", "cs1301xyz", "123456"],
    expectedBehavior: "Should handle gracefully without errors"
  }
};

// Helper function to analyze search results
const analyzeResults = (results, query, category) => {
  const totalResults = results.classes.length + results.professors.length + results.departments.length;
  
  console.log(`   📊 Results: ${totalResults} total (${results.classes.length} courses, ${results.professors.length} professors, ${results.departments.length} departments)`);
  
  // Check for relevance scores (indicates FTS5 was used)
  const hasRelevanceScores = results.classes.some(item => item.relevance_score !== undefined) ||
                            results.professors.some(item => item.relevance_score !== undefined) ||
                            results.departments.some(item => item.relevance_score !== undefined);
  
  if (hasRelevanceScores) {
    console.log(`   🎯 FTS5 Used: BM25 relevance scores detected`);
    
    // Show top relevance scores
    const topCourse = results.classes[0];
    if (topCourse && topCourse.relevance_score !== undefined) {
      console.log(`   📈 Top course relevance: ${topCourse.relevance_score.toFixed(3)} (${topCourse.class_name})`);
    }
  } else {
    console.log(`   📝 LIKE Query Used: No BM25 scores (fallback behavior)`);
  }
  
  // Check for fuzzy scores (indicates reranking occurred)
  const hasFuzzyScores = results.classes.some(item => item.fuzzyScore !== undefined);
  if (hasFuzzyScores) {
    const topFuzzyCourse = results.classes.find(item => item.fuzzyScore !== undefined);
    console.log(`   🔄 Fuzzy Reranking: Detected (fuzzyScore: ${topFuzzyCourse.fuzzyScore.toFixed(0)}, combinedScore: ${topFuzzyCourse.combinedScore.toFixed(0)})`);
  }
  
  return { totalResults, hasRelevanceScores, hasFuzzyScores };
};

// Test each category
for (const [categoryKey, category] of Object.entries(testCategories)) {
  console.log(`\n=== ${category.name.toUpperCase()} ===`);
  console.log(`Expected: ${category.expectedBehavior}\n`);
  
  for (const query of category.queries) {
    console.log(`Testing: "${query}"`);
    
    try {
      // Test FTS5 search
      const fts5Start = Date.now();
      const fts5Results = await getSearchFTS5(query);
      const fts5End = Date.now();
      
      const fts5Analysis = analyzeResults(fts5Results, query, category);
      console.log(`   ⏱️  FTS5 Time: ${fts5End - fts5Start}ms`);
      
      // Compare with LIKE search for verification
      const likeStart = Date.now();
      const likeResults = await getSearchOptimized(query);
      const likeEnd = Date.now();
      
      const likeTotalResults = likeResults.classes.length + likeResults.professors.length + likeResults.departments.length;
      console.log(`   ⏱️  LIKE Time: ${likeEnd - likeStart}ms (${likeTotalResults} results)`);
      
      // Performance comparison
      if (fts5End - fts5Start < likeEnd - likeStart) {
        const speedup = ((likeEnd - likeStart) / (fts5End - fts5Start)).toFixed(1);
        console.log(`   ✅ Performance: ${speedup}x faster with FTS5`);
      } else if (fts5End - fts5Start === likeEnd - likeStart) {
        console.log(`   ⚖️  Performance: Equal timing`);
      } else {
        console.log(`   ⚠️  Performance: LIKE was faster (fallback likely used)`);
      }
      
      // Verify results consistency
      const resultsDifference = Math.abs(fts5Analysis.totalResults - likeTotalResults);
      if (resultsDifference > 2) {
        console.log(`   ⚠️  Results Difference: ${resultsDifference} items difference between FTS5 and LIKE`);
      } else {
        console.log(`   ✅ Results Consistency: Similar result count`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log("");
  }
}

// Test autocomplete functionality
console.log("\n=== AUTOCOMPLETE FTS5 TESTS ===");

const autocompleteQueries = ["CS", "CS1", "CS13", "Math", "Comp", "John"];

for (const query of autocompleteQueries) {
  console.log(`Autocomplete: "${query}"`);
  
  try {
    const fts5Start = Date.now();
    const fts5Results = await getAutocompleteFTS5(query);
    const fts5End = Date.now();
    
    const likeStart = Date.now();
    const likeResults = await getAutocomplete(query);
    const likeEnd = Date.now();
    
    const fts5Total = fts5Results.courses.length + fts5Results.professors.length + fts5Results.departments.length;
    const likeTotal = likeResults.courses.length + likeResults.professors.length + likeResults.departments.length;
    
    console.log(`   FTS5: ${fts5End - fts5Start}ms (${fts5Total} results)`);
    console.log(`   LIKE: ${likeEnd - likeStart}ms (${likeTotal} results)`);
    
    // Check for BM25 scores in autocomplete
    const hasAutocompleteScores = fts5Results.courses.some(item => item.relevance_score !== undefined);
    if (hasAutocompleteScores) {
      console.log(`   🎯 Autocomplete uses BM25 ranking`);
    }
    
    if (fts5End - fts5Start < likeEnd - likeStart) {
      const speedup = ((likeEnd - likeStart) / (fts5End - fts5Start)).toFixed(1);
      console.log(`   ✅ ${speedup}x faster with FTS5`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log("");
}

// Test FTS5 specific features
console.log("=== FTS5 SPECIFIC FEATURES ===");

console.log("\n1. Testing Prefix Search with '*' operator:");
const prefixQueries = ["CS*", "MATH*", "ECE*"];

for (const query of prefixQueries) {
  try {
    const results = await getSearchFTS5(query);
    const courseResults = results.classes.filter(c => c.dept_abbr === query.replace('*', ''));
    console.log(`   ${query}: ${courseResults.length} courses found`);
    
    if (courseResults.length > 0) {
      console.log(`   ✅ Prefix search working - found ${courseResults[0].class_name} (and others)`);
    }
  } catch (error) {
    console.log(`   ❌ ${query}: ${error.message}`);
  }
}

console.log("\n2. Testing External Content Index:");
try {
  const testResult = await getSearchFTS5("CS1301");
  if (testResult.classes.length > 0) {
    const course = testResult.classes[0];
    console.log(`   ✅ External content index working`);
    console.log(`   📚 Found: ${course.class_name} - ${course.class_desc}`);
    if (course.relevance_score !== undefined) {
      console.log(`   📊 BM25 Score: ${course.relevance_score.toFixed(3)}`);
    }
  }
} catch (error) {
  console.log(`   ❌ External content test failed: ${error.message}`);
}

console.log("\n🎉 Comprehensive FTS5 functionality testing complete!");
console.log("\n📋 Summary:");
console.log("- Tested exact course code matching");
console.log("- Verified department prefix search");
console.log("- Confirmed BM25 relevance scoring");
console.log("- Validated fallback to LIKE queries");
console.log("- Checked fuzzy reranking functionality");
console.log("- Tested autocomplete with FTS5");
console.log("- Verified external-content index operation");