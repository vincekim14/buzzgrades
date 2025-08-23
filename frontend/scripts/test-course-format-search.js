#!/usr/bin/env node

/**
 * Test Course Format Search Script
 * 
 * Tests both "CS1331" and "CS 1331" search formats to verify
 * that the FTS5 optimization correctly handles both formats.
 */

import { getSearchFTS5, getAutocompleteFTS5 } from '../lib/db.js';

console.log('🧪 Testing Course Format Search - Both "CS1331" and "CS 1331" formats');
console.log('=' .repeat(70));

// Test cases for both formats
const testCases = [
  { search: 'CS1331', description: 'Format without space: "CS1331"' },
  { search: 'CS 1331', description: 'Format with space: "CS 1331"' },
  { search: 'MATH1501', description: 'Math course without space: "MATH1501"' },
  { search: 'MATH 1501', description: 'Math course with space: "MATH 1501"' },
];

console.log('\n📋 Running Full Search Tests:');
console.log('-'.repeat(50));

for (const testCase of testCases) {
  console.log(`\n🔍 Testing: ${testCase.description}`);
  
  try {
    const startTime = performance.now();
    const results = getSearchFTS5(testCase.search);
    const endTime = performance.now();
    const queryTime = (endTime - startTime).toFixed(2);
    
    console.log(`⏱️  Query time: ${queryTime}ms`);
    console.log(`📊 Results: ${results.classes?.length || 0} courses found`);
    
    if (results.classes && results.classes.length > 0) {
      results.classes.slice(0, 3).forEach((course, index) => {
        const courseCode = `${course.dept_abbr}${course.course_num}`;
        const courseName = `${course.dept_abbr} ${course.course_num}`;
        console.log(`   ${index + 1}. ${courseCode} (${courseName}) - ${course.class_desc}`);
        if (course.relevance_score !== undefined) {
          console.log(`      Relevance: ${course.relevance_score.toFixed(3)}`);
        }
        if (course.weighted_score !== undefined) {
          console.log(`      Weighted: ${course.weighted_score.toFixed(3)}`);
        }
      });
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

console.log('\n📋 Running Autocomplete Tests:');
console.log('-'.repeat(50));

for (const testCase of testCases) {
  console.log(`\n🔍 Testing: ${testCase.description}`);
  
  try {
    const startTime = performance.now();
    const results = getAutocompleteFTS5(testCase.search);
    const endTime = performance.now();
    const queryTime = (endTime - startTime).toFixed(2);
    
    console.log(`⏱️  Query time: ${queryTime}ms`);
    console.log(`📊 Results: ${results.courses?.length || 0} courses found`);
    
    if (results.courses && results.courses.length > 0) {
      results.courses.forEach((course, index) => {
        const courseCode = `${course.dept_abbr}${course.course_num}`;
        const courseName = `${course.dept_abbr} ${course.course_num}`;
        console.log(`   ${index + 1}. ${courseCode} (${courseName}) - ${course.class_desc}`);
        if (course.relevance_score !== undefined) {
          console.log(`      Relevance: ${course.relevance_score.toFixed(3)}`);
        }
        if (course.weighted_score !== undefined) {
          console.log(`      Weighted: ${course.weighted_score.toFixed(3)}`);
        }
      });
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

console.log('\n🎯 Performance Comparison:');
console.log('-'.repeat(50));

// Compare performance between the two formats
const performanceTests = [
  { search: 'CS1331', name: 'No Space' },
  { search: 'CS 1331', name: 'With Space' }
];

for (const test of performanceTests) {
  const times = [];
  
  // Run 5 iterations for average
  for (let i = 0; i < 5; i++) {
    const startTime = performance.now();
    getSearchFTS5(test.search);
    const endTime = performance.now();
    times.push(endTime - startTime);
  }
  
  const avgTime = (times.reduce((a, b) => a + b) / times.length).toFixed(2);
  const minTime = Math.min(...times).toFixed(2);
  const maxTime = Math.max(...times).toFixed(2);
  
  console.log(`${test.name} format (${test.search}):`);
  console.log(`  Average: ${avgTime}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);
}

console.log('\n✅ Course format search testing complete!');
console.log('\n📝 Expected Results:');
console.log('- Both "CS1331" and "CS 1331" should return identical results');
console.log('- Query times should be similar (sub-millisecond for exact matches)');
console.log('- FTS5 should handle both formats efficiently');