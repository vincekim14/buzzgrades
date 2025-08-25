import { getSearchFTS5 } from '../lib/db/fts-search.js';

async function comprehensiveTest() {
  console.log('🧪 Comprehensive Search Testing');
  console.log('================================');
  
  const testCases = [
    { query: 'CS 133', type: 'Course Code' },
    { query: 'MATH 1550', type: 'Course Code' },
    { query: 'data structures', type: 'Content' },
    { query: 'algorithms', type: 'Content' },
    { query: 'CHEM1211K', type: 'Content (Letter)' }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing: "${testCase.query}" (${testCase.type})`);
    console.log(''.padEnd(50, '-'));
    
    const start = Date.now();
    try {
      const result = await getSearchFTS5(testCase.query);
      const duration = Date.now() - start;
      
      // Check for duplicates
      const classIds = result.classes.map(c => c.id);
      const uniqueClassIds = new Set(classIds);
      const instructorIds = result.professors.map(p => p.id);
      const uniqueInstructorIds = new Set(instructorIds);
      
      const classDuplicates = classIds.length !== uniqueClassIds.size;
      const instructorDuplicates = instructorIds.length !== uniqueInstructorIds.size;
      const hasDuplicates = classDuplicates || instructorDuplicates;
      
      const speedStatus = duration > 50 ? '❌ SLOW' : '✅';
      const duplicateStatus = hasDuplicates ? '❌ HAS DUPLICATES' : '✅';
      
      console.log(`⏱️  Duration: ${duration}ms ${speedStatus}`);
      console.log(`📚 Classes: ${result.classes.length} ${duplicateStatus}`);
      console.log(`👨‍🏫 Instructors: ${result.professors.length}`);
      console.log(`🏫 Departments: ${result.departments.length}`);
      
      if (result.classes.length > 0) {
        console.log('📝 Top classes:');
        result.classes.slice(0, 3).forEach((c, i) => {
          console.log(`   ${i+1}. ${c.class_name} - ${c.class_desc} (score: ${c.relevanceScore})`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  process.exit(0);
}

comprehensiveTest();