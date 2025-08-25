#!/usr/bin/env node
import { getSearchFTS5 } from "../lib/db/index.js";

// Test cases based on recommendations
const TEST_CASES = [
  // Department searches
  { query: 'chem', type: 'department', expectedFast: true },
  { query: 'math', type: 'department', expectedFast: true },
  { query: 'cs', type: 'department', expectedFast: true },
  
  // Course code searches
  { query: 'CS 1332', type: 'course_code', expectedFast: true },
  { query: 'CHEM 1211K', type: 'course_code', expectedFast: true },
  
  // Content searches
  { query: 'algorithms', type: 'content', expectedFast: false },
  { query: 'linear algebra', type: 'content', expectedFast: false },
];

// Performance thresholds
const PERFORMANCE_TARGETS = {
  warm_max: 30, // ms
  cold_max: 100, // ms
  cached_dept_max: 10 // ms
};

class PerformanceTracker {
  constructor() {
    this.results = [];
  }
  
  addResult(query, type, duration, isCold = false) {
    this.results.push({ query, type, duration, isCold });
  }
  
  getStats() {
    const all = this.results.filter(r => !r.isCold);
    const cold = this.results.filter(r => r.isCold);
    const deptSearches = all.filter(r => r.type === 'department');
    
    return {
      avgWarm: all.length ? Math.round(all.reduce((sum, r) => sum + r.duration, 0) / all.length) : 0,
      avgCold: cold.length ? Math.round(cold.reduce((sum, r) => sum + r.duration, 0) / cold.length) : 0,
      avgDept: deptSearches.length ? Math.round(deptSearches.reduce((sum, r) => sum + r.duration, 0) / deptSearches.length) : 0,
      maxWarm: all.length ? Math.max(...all.map(r => r.duration)) : 0,
      minWarm: all.length ? Math.min(...all.map(r => r.duration)) : 0
    };
  }
  
  printReport() {
    const stats = this.getStats();
    console.log('\n📊 PERFORMANCE REPORT');
    console.log('====================');
    console.log(`Average warm search: ${stats.avgWarm}ms (target: ≤${PERFORMANCE_TARGETS.warm_max}ms)`);
    console.log(`Average cold start: ${stats.avgCold}ms (target: ≤${PERFORMANCE_TARGETS.cold_max}ms)`);
    console.log(`Average dept search: ${stats.avgDept}ms (target: ≤${PERFORMANCE_TARGETS.cached_dept_max}ms)`);
    console.log(`Range: ${stats.minWarm}ms - ${stats.maxWarm}ms`);
    
    // Check if targets met
    const warmPass = stats.avgWarm <= PERFORMANCE_TARGETS.warm_max;
    const coldPass = stats.avgCold <= PERFORMANCE_TARGETS.cold_max;
    const deptPass = stats.avgDept <= PERFORMANCE_TARGETS.cached_dept_max;
    
    console.log('\n🎯 TARGET ANALYSIS:');
    console.log(`Warm search target: ${warmPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Cold start target: ${coldPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Dept search target: ${deptPass ? '✅ PASS' : '❌ FAIL'}`);
    
    return { warmPass, coldPass, deptPass };
  }
}

async function testSearch(query, type, tracker, isCold = false) {
  const label = isCold ? '[COLD]' : '[WARM]';
  console.log(`\n🔍 ${label} Testing ${type}: "${query}"`);
  
  const startTime = Date.now();
  
  try {
    const results = await getSearchFTS5(query);
    const duration = Date.now() - startTime;
    
    tracker.addResult(query, type, duration, isCold);
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📚 Classes: ${results.classes?.length || 0}`);
    console.log(`👨‍🏫 Instructors: ${results.professors?.length || 0}`);
    console.log(`🏫 Departments: ${results.departments?.length || 0}`);
    
    // Validate results quality
    if (type === 'department' && results.departments?.length === 0) {
      console.log('⚠️  WARNING: No departments found for department search');
    }
    
    // Show top result for validation
    if (results.departments?.length > 0) {
      const topDept = results.departments[0];
      console.log(`   Top dept: ${topDept.dept_abbr} - ${topDept.dept_name}`);
    }
    if (results.classes?.length > 0) {
      const topClass = results.classes[0];
      console.log(`   Top class: ${topClass.class_name} - ${topClass.class_desc?.substring(0, 50)}...`);
    }
    
    return { success: true, duration };
    
  } catch (error) {
    console.error('❌ Search failed:', error);
    return { success: false, error: error.message };
  }
}

// Main test runner
async function runPerformanceTests() {
  console.log('🚀 BuzzGrades Search Performance Test Suite');
  console.log('==========================================');
  
  const tracker = new PerformanceTracker();
  let failedTests = 0;
  
  // Cold start test (first search)
  console.log('\n❄️  COLD START TEST');
  const coldResult = await testSearch('chem', 'department', tracker, true);
  if (!coldResult.success) failedTests++;
  
  // Warm up with a few searches
  console.log('\n🔥 WARM-UP PHASE');
  for (let i = 0; i < 3; i++) {
    await testSearch('math', 'department', tracker, false);
    await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
  }
  
  // Main test suite
  console.log('\n🧪 MAIN TEST SUITE');
  for (const testCase of TEST_CASES) {
    const result = await testSearch(testCase.query, testCase.type, tracker, false);
    if (!result.success) failedTests++;
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Test consistency (repeat some searches)
  console.log('\n🔄 CONSISTENCY TEST');
  for (let i = 0; i < 3; i++) {
    await testSearch('cs', 'department', tracker, false);
    await testSearch('algorithms', 'content', tracker, false);
  }
  
  // Generate report
  const { warmPass, coldPass, deptPass } = tracker.printReport();
  
  console.log('\n📋 SUMMARY');
  console.log('===========');
  console.log(`Total tests: ${TEST_CASES.length + 7}`) // +7 for cold, warmup, consistency tests
  console.log(`Failed tests: ${failedTests}`);
  console.log(`Overall status: ${failedTests === 0 && warmPass && coldPass ? '✅ ALL PASS' : '❌ NEEDS ATTENTION'}`);
  
  if (!warmPass || !coldPass || !deptPass) {
    console.log('\n💡 RECOMMENDATIONS:');
    if (!warmPass) console.log('- Optimize database queries and caching for warm searches');
    if (!coldPass) console.log('- Improve cold start performance (connection pre-warming)');
    if (!deptPass) console.log('- Implement aggressive caching for department searches');
  }
  
  console.log('\n🔧 To test API endpoints:');
  console.log('1. Run: npm run dev (in frontend directory)');
  console.log('2. Open: http://localhost:3000 and test search functionality');
  console.log('3. Check browser DevTools Network tab for X-Search-Duration headers');
}

// Handle both direct execution and module import
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceTests().catch(console.error);
}

// Export for use as module
export { runPerformanceTests, testSearch, PerformanceTracker, TEST_CASES };