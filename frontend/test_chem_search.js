#!/usr/bin/env node
import { getSearchFTS5 } from "./lib/db/index.js";

async function testChemSearch() {
  console.log('🧪 Testing Department Search: "chem"');
  console.log('================================');
  
  const startTime = Date.now();
  
  try {
    const results = await getSearchFTS5("chem");
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📚 Classes: ${results.classes?.length || 0}`);
    console.log(`👨‍🏫 Instructors: ${results.professors?.length || 0}`);
    console.log(`🏫 Departments: ${results.departments?.length || 0}`);
    
    console.log('\n📝 Top results:');
    if (results.departments?.length > 0) {
      console.log('  Departments:');
      results.departments.slice(0, 3).forEach((dept, i) => {
        console.log(`    ${i + 1}. ${dept.dept_abbr} - ${dept.dept_name} (score: ${dept.relevanceScore})`);
      });
    }
    
    if (results.classes?.length > 0) {
      console.log('  Classes:');
      results.classes.slice(0, 3).forEach((cls, i) => {
        console.log(`    ${i + 1}. ${cls.class_name} - ${cls.class_desc} (score: ${cls.relevanceScore})`);
      });
    }
    
    if (results.professors?.length > 0) {
      console.log('  Professors:');
      results.professors.slice(0, 3).forEach((prof, i) => {
        console.log(`    ${i + 1}. ${prof.name} (score: ${prof.relevanceScore})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error);
  }
}

// Run multiple times to test consistency
async function runTests() {
  for (let i = 0; i < 5; i++) {
    console.log(`\n--- Test Run ${i + 1} ---`);
    await testChemSearch();
  }
}

runTests();