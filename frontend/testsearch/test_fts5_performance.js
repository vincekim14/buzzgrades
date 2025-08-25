const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../data-app/ProcessedData.db');
const db = Database(dbPath, { readonly: true, fileMustExist: true });

console.log('🧪 Testing FTS5 Table Usage');
console.log('============================\n');

// Test if we can query each FTS5 table directly
const testQueries = [
  {
    name: 'Courses FTS5 - CS search',
    sql: `SELECT COUNT(*) as count FROM courses_fts WHERE courses_fts MATCH 'CS*'`,
    params: []
  },
  {
    name: 'Professors FTS5 - John search',
    sql: `SELECT COUNT(*) as count FROM professors_fts WHERE professors_fts MATCH 'John*'`,
    params: []
  },
  {
    name: 'Departments FTS5 - Computer search',
    sql: `SELECT COUNT(*) as count FROM departments_fts WHERE departments_fts MATCH 'Computer*'`,
    params: []
  },
  {
    name: 'Combined search - FTS5 performance',
    sql: `
      SELECT 'courses' as type, class_id as id, dept_abbr, course_num, bm25(courses_fts) as score
      FROM courses_fts 
      WHERE courses_fts MATCH 'algorithms*'
      ORDER BY bm25(courses_fts) ASC LIMIT 5
    `,
    params: []
  }
];

for (const test of testQueries) {
  console.log(`Testing: ${test.name}`);
  
  const start = Date.now();
  
  try {
    const results = db.prepare(test.sql).all(...test.params);
    const duration = Date.now() - start;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Results: ${results.length} items`);
    
    if (results.length > 0 && results[0].count !== undefined) {
      console.log(`   Count: ${results[0].count}`);
    } else if (results.length > 0) {
      results.slice(0, 3).forEach(r => {
        if (r.dept_abbr && r.course_num) {
          console.log(`   ${r.dept_abbr} ${r.course_num} (score: ${r.score?.toFixed(2) || 'N/A'})`);
        } else {
          console.log(`   ${JSON.stringify(r)}`);
        }
      });
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  console.log('');
}

// Test the search pattern we're using
console.log('🔍 Testing Department Search Pattern');
console.log('====================================\n');

const deptTests = [
  'CS*',
  'MATH*', 
  'Computer*',
  'Science*'
];

for (const pattern of deptTests) {
  console.log(`Testing pattern: "${pattern}"`);
  
  const start = Date.now();
  
  try {
    const results = db.prepare(`
      SELECT dept_abbr, dept_name, bm25(departments_fts) as score
      FROM departments_fts 
      WHERE departments_fts MATCH ?
      ORDER BY bm25(departments_fts) ASC LIMIT 3
    `).all(pattern);
    
    const duration = Date.now() - start;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Results: ${results.length} items`);
    
    results.forEach(r => {
      console.log(`   ${r.dept_abbr}: ${r.dept_name} (score: ${r.score.toFixed(2)})`);
    });
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  console.log('');
}

db.close();
console.log('✅ FTS5 testing complete!');
