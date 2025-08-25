import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../data-app/ProcessedData.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

// Test direct SQL LIKE performance
async function testDirectSQL() {
  console.log('🚀 Testing Direct SQL LIKE Performance');
  console.log('=====================================');
  
  const tests = [
    { query: 'CS 133', sql: "SELECT class_id, dept_abbr, course_num FROM courses_fts WHERE dept_abbr = 'CS' AND course_num LIKE '133%' GROUP BY class_id LIMIT 30" },
    { query: 'MATH 1550', sql: "SELECT class_id, dept_abbr, course_num FROM courses_fts WHERE dept_abbr = 'MATH' AND course_num LIKE '1550%' GROUP BY class_id LIMIT 30" }
  ];
  
  for (const test of tests) {
    console.log(`\\nTesting: "${test.query}"`);
    
    const start = Date.now();
    try {
      const results = db.prepare(test.sql).all();
      const duration = Date.now() - start;
      console.log(`⏱️  Direct SQL: ${duration}ms - ${results.length} results`);
      results.forEach(r => console.log(`   ${r.dept_abbr} ${r.course_num}`));
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

// Test FTS5 performance
async function testFTS5() {
  console.log('\\n🔍 Testing FTS5 MATCH Performance');
  console.log('==================================');
  
  const tests = [
    { query: 'CS 133', fts: 'CS AND 133*' },
    { query: 'MATH 1550', fts: 'MATH AND 1550*' },
    { query: 'data structures', fts: '"data structures"*' },
    { query: 'algorithms', fts: 'algorithms*' }
  ];
  
  for (const test of tests) {
    console.log(`\\nTesting: "${test.query}"`);
    
    const start = Date.now();
    try {
      const sql = `
        SELECT class_id, dept_abbr, course_num, course_title, bm25(courses_fts) as score
        FROM courses_fts 
        WHERE courses_fts MATCH ?
        ORDER BY bm25(courses_fts) ASC 
        LIMIT 10
      `;
      const results = db.prepare(sql).all(test.fts);
      const duration = Date.now() - start;
      console.log(`⏱️  FTS5: ${duration}ms - ${results.length} results`);
      results.slice(0, 3).forEach(r => console.log(`   ${r.dept_abbr} ${r.course_num} - ${r.course_title} (score: ${r.score.toFixed(2)})`));
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

// Test complex vs simple queries  
async function testQueryComplexity() {
  console.log('\\n🧪 Testing Query Complexity Impact');
  console.log('===================================');
  
  const simpleSQL = "SELECT class_id, dept_abbr, course_num FROM courses_fts WHERE dept_abbr = 'CS' AND course_num LIKE '133%' LIMIT 10";
  const complexSQL = `
    SELECT DISTINCT 
      c.class_id,
      c.dept_abbr,
      c.course_num,
      c.course_title,
      c.total_students,
      cd.total_grades
    FROM courses_fts c
    LEFT JOIN classdistribution cd ON c.class_id = cd.id
    WHERE c.dept_abbr = 'CS' AND c.course_num LIKE '133%'
    GROUP BY c.class_id
    ORDER BY c.course_num ASC
    LIMIT 10
  `;
  
  console.log('Simple query:');
  let start = Date.now();
  const simpleResults = db.prepare(simpleSQL).all();
  console.log(`⏱️  Simple: ${Date.now() - start}ms - ${simpleResults.length} results`);
  
  console.log('\\nComplex query:');
  start = Date.now();
  const complexResults = db.prepare(complexSQL).all();
  console.log(`⏱️  Complex: ${Date.now() - start}ms - ${complexResults.length} results`);
}

// Run all tests
async function runPerformanceTests() {
  console.log('🎯 Database Performance Analysis');
  console.log('================================');
  
  await testDirectSQL();
  await testFTS5();
  await testQueryComplexity();
  
  console.log('\\n📊 Summary');
  console.log('===========');
  console.log('✅ Tests completed - check results above');
  
  db.close();
  process.exit(0);
}

runPerformanceTests();