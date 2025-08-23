#!/usr/bin/env node

/**
 * Test Runner for Enhanced Search System
 * 
 * Runs all search tests in sequence and provides comprehensive reporting
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("🧪 Running Enhanced Search System Test Suite\n");

const testFiles = [
  "test-db-queries.js",
  "test-fts5-comprehensive.js", 
  "test-bm25-ranking.js",
  "test-caching.js",
  "test-fuzzy-reranking.js",
  "test-performance.js",
  // Note: API tests require server running, run separately
];

const runTest = (testFile) => {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏃 Running ${testFile}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const testPath = path.join(__dirname, testFile);
    const child = spawn("node", [testPath], { 
      stdio: "inherit",
      cwd: path.join(__dirname, "..", "..")
    });
    
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ ${testFile} completed successfully\n`);
        resolve({ testFile, success: true, code });
      } else {
        console.log(`\n❌ ${testFile} failed with code ${code}\n`);
        resolve({ testFile, success: false, code });
      }
    });
    
    child.on("error", (error) => {
      console.log(`\n💥 ${testFile} error: ${error.message}\n`);
      reject({ testFile, success: false, error: error.message });
    });
  });
};

const runAllTests = async () => {
  const results = [];
  const startTime = Date.now();
  
  for (const testFile of testFiles) {
    try {
      const result = await runTest(testFile);
      results.push(result);
    } catch (error) {
      results.push(error);
    }
  }
  
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  
  // Summary report
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏁 TEST SUITE SUMMARY`);
  console.log(`${'='.repeat(80)}\n`);
  
  const passedTests = results.filter(r => r.success).length;
  const failedTests = results.filter(r => !r.success).length;
  
  console.log(`📊 Results: ${passedTests}/${results.length} tests passed`);
  console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)} seconds\n`);
  
  // Detailed results
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${index + 1}. ${result.testFile}`);
  });
  
  // Next steps
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 NEXT STEPS`);
  console.log(`${'='.repeat(80)}\n`);
  
  if (failedTests > 0) {
    console.log(`⚠️  ${failedTests} test(s) failed. Please review the output above and fix issues.`);
    console.log(`\n🛠️  Common fixes:`);
    console.log(`- Ensure ProcessedData.db exists in ../data-app/`);
    console.log(`- Run 'node scripts/setup-fts5.js' to create FTS5 tables`);
    console.log(`- Run 'node scripts/sync-fts5.js' to populate FTS5 data`);
  } else {
    console.log(`🎉 All tests passed! Your enhanced search system is working correctly.`);
    console.log(`\n📋 Performance verification checklist:`);
    console.log(`✅ FTS5 external-content indexes functioning`);
    console.log(`✅ BM25 relevance scoring active`);
    console.log(`✅ LRU caching working (50 search + 100 autocomplete)`);
    console.log(`✅ Fuzzy reranking triggering when results < 3`);
    console.log(`✅ Database queries optimized with prepared statements`);
    console.log(`✅ Smart fallback from FTS5 to LIKE when appropriate`);
  }
  
  console.log(`\n🌐 To test API endpoints (requires server running):`);
  console.log(`   npm run dev  # In another terminal`);
  console.log(`   node scripts/search-tests/test-api-endpoints.js`);
  
  console.log(`\n📖 For detailed documentation, see:`);
  console.log(`   frontend/SEARCH_README.md`);
  
  process.exit(failedTests > 0 ? 1 : 0);
};

// Handle interruption
process.on('SIGINT', () => {
  console.log('\n\n⏸️  Test suite interrupted by user');
  process.exit(130);
});

runAllTests().catch((error) => {
  console.error(`\n💥 Test runner failed: ${error.message}`);
  process.exit(1);
});