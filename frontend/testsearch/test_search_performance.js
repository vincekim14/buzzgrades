const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../data-app/ProcessedData.db');
const db = Database(dbPath, { readonly: true, fileMustExist: true });

// Test search performance for different query types
function testSearchPerformance() {
  console.log('🚀 Testing Search Performance');
  console.log('=============================\n');

  const testQueries = [
    { name: 'Department (CS)', query: 'CS', type: 'dept' },
    { name: 'Department (MATH)', query: 'MATH', type: 'dept' },
    { name: 'Course Code (CS 1331)', query: 'CS 1331', type: 'course' },
    { name: 'Course Code (MATH 1550)', query: 'MATH 1550', type: 'course' },
    { name: 'Partial Course (CS13)', query: 'CS13', type: 'partial' },
    { name: 'Content Search (algorithms)', query: 'algorithms', type: 'content' },
    { name: 'Content Search (data structures)', query: 'data structures', type: 'content' }
  ];

  for (const test of testQueries) {
    console.log(`Testing: ${test.name} - "${test.query}"`);
    
    // Test LIKE query performance
    const start = Date.now();
    let results = [];
    
    try {
      if (test.type === 'dept') {
        // Department search
        results = db.prepare(`
          SELECT DISTINCT dept_abbr, dept_name 
          FROM departmentdistribution 
          WHERE dept_abbr LIKE ? OR dept_name LIKE ?
        `).all([`%${test.query}%`, `%${test.query}%`]);
      } else if (test.type === 'course') {
        // Course search
        const parts = test.query.split(' ');
        const dept = parts[0];
        const num = parts[1];
        results = db.prepare(`
          SELECT DISTINCT dept_abbr, course_num, class_desc 
          FROM classdistribution 
          WHERE dept_abbr = ? AND course_num = ?
        `).all([dept, num]);
      } else if (test.type === 'partial') {
        // Partial course search
        const dept = test.query.match(/^[A-Z]+/)[0];
        const num = test.query.match(/[0-9]+/)[0];
        results = db.prepare(`
          SELECT DISTINCT dept_abbr, course_num, class_desc 
          FROM classdistribution 
          WHERE dept_abbr = ? AND course_num LIKE ?
        `).all([dept, `${num}%`]);
      } else {
        // Content search
        results = db.prepare(`
          SELECT DISTINCT dept_abbr, course_num, class_desc 
          FROM classdistribution 
          WHERE class_desc LIKE ?
        `).all([`%${test.query}%`]);
      }
      
      const duration = Date.now() - start;
      const speedStatus = duration > 50 ? '❌ SLOW' : duration > 20 ? '⚠️ MEDIUM' : '✅ FAST';
      
      console.log(`⏱️  Duration: ${duration}ms ${speedStatus}`);
      console.log(`📊 Results: ${results.length} items`);
      
      // Show first few results
      if (results.length > 0) {
        const sample = results.slice(0, 3);
        sample.forEach(r => {
          if (r.dept_abbr && r.course_num) {
            console.log(`   ${r.dept_abbr} ${r.course_num}`);
          } else if (r.dept_abbr && r.dept_name) {
            console.log(`   ${r.dept_abbr}: ${r.dept_name}`);
          }
        });
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }
}

// Run the test
testSearchPerformance();
db.close();
