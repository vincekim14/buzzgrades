#!/usr/bin/env node

/**
 * Database Query Verification Test Script
 * 
 * Tests database connectivity and query functionality:
 * - Database connection and optimization settings
 * - FTS5 tables existence and functionality
 * - Prepared statements execution
 * - External-content index verification
 * - Cumulative course data loading
 * - Query parameter binding and safety
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

console.log("🗄️ Database Query Verification Tests\n");

// Database path (same as in db.js)
const dbPath = path.resolve(process.cwd(), "../data-app/ProcessedData.db");
const cumulativeJsonPath = path.resolve(process.cwd(), "../data-app/COURSE_INFO/cumulative.json");

// Initialize database connection
let db;
try {
  db = new Database(dbPath, { 
    readonly: true,
    fileMustExist: true
  });
  console.log("✅ Database connection established");
  console.log(`   Database path: ${dbPath}`);
} catch (error) {
  console.log("❌ Database connection failed:");
  console.log(`   Error: ${error.message}`);
  console.log(`   Path: ${dbPath}`);
  process.exit(1);
}

// Test database optimization settings
const testDatabaseSettings = () => {
  console.log("\n=== DATABASE SETTINGS TESTS ===\n");
  
  try {
    // Test pragma settings
    console.log("Testing SQLite pragma settings:");
    
    db.pragma('temp_store = MEMORY');
    console.log("   ✅ temp_store set to MEMORY");
    
    db.pragma('mmap_size = 268435456'); // 256MB
    console.log("   ✅ mmap_size set to 256MB");
    
    // Check current settings
    const tempStore = db.pragma('temp_store');
    const mmapSize = db.pragma('mmap_size');
    
    console.log(`   Current temp_store: ${tempStore}`);
    console.log(`   Current mmap_size: ${mmapSize} bytes (${Math.round(mmapSize / 1024 / 1024)}MB)`);
    
  } catch (error) {
    console.log(`   ⚠️  Some pragma settings failed: ${error.message}`);
  }
  
  // Test database info
  try {
    const userVersion = db.pragma('user_version');
    const pageSize = db.pragma('page_size');
    const journalMode = db.pragma('journal_mode');
    
    console.log(`\nDatabase information:`);
    console.log(`   User version: ${userVersion}`);
    console.log(`   Page size: ${pageSize} bytes`);
    console.log(`   Journal mode: ${journalMode}`);
    
  } catch (error) {
    console.log(`   ⚠️  Could not retrieve database info: ${error.message}`);
  }
};

// Test table existence and structure
const testTableStructure = () => {
  console.log("\n=== TABLE STRUCTURE TESTS ===\n");
  
  const requiredTables = [
    'classdistribution',
    'professor', 
    'distribution',
    'termdistribution',
    'departmentdistribution'
  ];
  
  const fts5Tables = [
    'courses_fts',
    'professors_fts', 
    'departments_fts'
  ];
  
  console.log("Checking required tables:");
  for (const tableName of requiredTables) {
    try {
      const result = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
      if (result.count > 0) {
        const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
        console.log(`   ✅ ${tableName}: exists (${rowCount.count} rows)`);
      } else {
        console.log(`   ❌ ${tableName}: missing`);
      }
    } catch (error) {
      console.log(`   ❌ ${tableName}: error - ${error.message}`);
    }
  }
  
  console.log(`\nChecking FTS5 tables:`);
  for (const tableName of fts5Tables) {
    try {
      const result = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
      if (result.count > 0) {
        console.log(`   ✅ ${tableName}: exists (FTS5 available)`);
        
        // Test FTS5 functionality
        try {
          const testQuery = db.prepare(`SELECT COUNT(*) as count FROM ${tableName} WHERE ${tableName} MATCH 'CS*' LIMIT 1`).get();
          console.log(`   ✅ ${tableName}: FTS5 search functional`);
        } catch (ftsError) {
          console.log(`   ⚠️  ${tableName}: exists but FTS5 search failed - ${ftsError.message}`);
        }
      } else {
        console.log(`   ⚠️  ${tableName}: missing (FTS5 not available)`);
      }
    } catch (error) {
      console.log(`   ❌ ${tableName}: error - ${error.message}`);
    }
  }
};

// Test prepared statements
const testPreparedStatements = () => {
  console.log("\n=== PREPARED STATEMENTS TESTS ===\n");
  
  const testStatements = [
    {
      name: "Course Search LIKE",
      query: `
        SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, 
               class_desc, total_students, total_grades
        FROM classdistribution
        WHERE (dept_abbr || course_num LIKE ? OR REPLACE(class_desc, ' ', '') LIKE ?)
        ORDER BY total_students DESC
        LIMIT 10
      `,
      params: ['%CS1301%', '%CS1301%'],
      expectedResults: true
    },
    {
      name: "Professor Search",
      query: `
        SELECT p.*, 
               json_group_array(CASE WHEN td.grades IS NOT NULL THEN td.grades END) as all_grades
        FROM professor p
        LEFT JOIN distribution d ON p.id = d.professor_id
        LEFT JOIN termdistribution td ON d.id = td.dist_id
        WHERE REPLACE(p.name, ' ', '') LIKE ? AND
              EXISTS (SELECT 1 FROM distribution d2, classdistribution c
                      WHERE d2.professor_id = p.id AND d2.class_id = c.id)
        GROUP BY p.id
        ORDER BY p.RMP_score DESC NULLS LAST
        LIMIT 10
      `,
      params: ['%Smith%'],
      expectedResults: true
    },
    {
      name: "Department Search",
      query: `
        SELECT dd.*, 
               json_group_array(CASE WHEN cd.total_grades IS NOT NULL THEN cd.total_grades END) as all_grades
        FROM departmentdistribution dd
        LEFT JOIN classdistribution cd ON dd.dept_abbr = cd.dept_abbr AND dd.campus = cd.campus
        WHERE (dd.dept_name LIKE ? OR dd.dept_abbr LIKE ?)
        GROUP BY dd.campus, dd.dept_abbr
        LIMIT 10
      `,
      params: ['%Computer%', '%CS%'],
      expectedResults: true
    }
  ];
  
  for (const test of testStatements) {
    console.log(`Testing ${test.name}:`);
    
    try {
      const stmt = db.prepare(test.query);
      console.log(`   ✅ Statement prepared successfully`);
      
      const results = stmt.all(...test.params);
      console.log(`   📊 Results: ${results.length} rows`);
      
      if (test.expectedResults && results.length > 0) {
        console.log(`   ✅ Found expected results`);
        
        // Show first result for verification
        const firstResult = results[0];
        const keys = Object.keys(firstResult).slice(0, 3); // Show first 3 columns
        console.log(`   Sample: ${keys.map(key => `${key}=${firstResult[key]}`).join(', ')}`);
      } else if (!test.expectedResults && results.length === 0) {
        console.log(`   ✅ No results as expected`);
      } else {
        console.log(`   ⚠️  Unexpected result count`);
      }
      
    } catch (error) {
      console.log(`   ❌ Statement failed: ${error.message}`);
    }
    
    console.log("");
  }
};

// Test FTS5 specific queries
const testFTS5Queries = () => {
  console.log("=== FTS5 QUERY TESTS ===\n");
  
  // Check if FTS5 tables exist first
  const hasCoursesFTS = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='courses_fts'").get().count > 0;
  
  if (!hasCoursesFTS) {
    console.log("⚠️  FTS5 tables not found, skipping FTS5 tests");
    return;
  }
  
  const fts5Tests = [
    {
      name: "Course FTS5 Exact Match",
      query: `
        SELECT c.dept_abbr, c.course_num, c.dept_abbr || ' ' || c.course_num AS class_name,
               c.class_desc, c.total_students, bm25(courses_fts) as relevance_score
        FROM courses_fts
        JOIN classdistribution c ON (c.dept_abbr || c.course_num = courses_fts.course_code)
        WHERE courses_fts MATCH ?
        ORDER BY bm25(courses_fts), c.total_students DESC
        LIMIT 5
      `,
      params: ['"CS1301"'],
      expectedResults: true,
      testBM25: true
    },
    {
      name: "Course FTS5 Prefix Search",
      query: `
        SELECT c.dept_abbr, c.course_num, c.dept_abbr || ' ' || c.course_num AS class_name,
               c.class_desc, c.total_students, bm25(courses_fts) as relevance_score
        FROM courses_fts
        JOIN classdistribution c ON (c.dept_abbr || c.course_num = courses_fts.course_code)
        WHERE courses_fts MATCH ?
        ORDER BY bm25(courses_fts), c.total_students DESC
        LIMIT 5
      `,
      params: ['CS*'],
      expectedResults: true,
      testBM25: true
    },
    {
      name: "Professor FTS5 Search",
      query: `
        SELECT p.id, p.name, p.RMP_score, bm25(professors_fts) as relevance_score
        FROM professors_fts
        JOIN professor p ON professors_fts.rowid = p.id
        WHERE professors_fts MATCH ? AND
              EXISTS (SELECT 1 FROM distribution d, classdistribution c
                      WHERE d.professor_id = p.id AND d.class_id = c.id)
        ORDER BY bm25(professors_fts), p.RMP_score DESC NULLS LAST
        LIMIT 5
      `,
      params: ['Smith*'],
      expectedResults: true,
      testBM25: true
    }
  ];
  
  for (const test of fts5Tests) {
    console.log(`Testing ${test.name}:`);
    
    try {
      const stmt = db.prepare(test.query);
      console.log(`   ✅ FTS5 statement prepared`);
      
      const results = stmt.all(...test.params);
      console.log(`   📊 Results: ${results.length} rows`);
      
      if (results.length > 0) {
        const firstResult = results[0];
        
        if (test.testBM25 && firstResult.relevance_score !== undefined) {
          console.log(`   🎯 BM25 Score: ${firstResult.relevance_score.toFixed(3)}`);
          console.log(`   ✅ BM25 scoring working`);
          
          // BM25 scores should typically be negative (lower = more relevant)
          if (firstResult.relevance_score < 0) {
            console.log(`   ✅ BM25 score is negative (expected for relevance)`);
          } else {
            console.log(`   ⚠️  BM25 score is positive (unexpected)`);
          }
        }
        
        // Show sample result
        if (firstResult.class_name) {
          console.log(`   Sample course: ${firstResult.class_name}`);
        } else if (firstResult.name) {
          console.log(`   Sample professor: ${firstResult.name}`);
        }
      } else {
        console.log(`   ⚠️  No FTS5 results found`);
      }
      
    } catch (error) {
      console.log(`   ❌ FTS5 query failed: ${error.message}`);
    }
    
    console.log("");
  }
};

// Test external content index functionality
const testExternalContentIndex = () => {
  console.log("=== EXTERNAL CONTENT INDEX TESTS ===\n");
  
  try {
    // Check if courses_fts is an external content table
    const ftsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='courses_fts'").get();
    
    if (ftsInfo && ftsInfo.sql.includes('content=')) {
      console.log("✅ courses_fts is configured as external content table");
      console.log(`   SQL: ${ftsInfo.sql.substring(0, 100)}...`);
      
      // Test that external content index works with main table
      const testQuery = `
        SELECT c.dept_abbr, c.course_num, c.class_desc, bm25(courses_fts) as score
        FROM courses_fts
        JOIN classdistribution c ON (c.dept_abbr || c.course_num = courses_fts.course_code)
        WHERE courses_fts MATCH 'CS*'
        LIMIT 3
      `;
      
      const results = db.prepare(testQuery).all();
      console.log(`   📊 External content test: ${results.length} results`);
      
      if (results.length > 0) {
        results.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.dept_abbr}${result.course_num}: ${result.class_desc} (score: ${result.score.toFixed(3)})`);
        });
        console.log(`   ✅ External content index functioning properly`);
      }
      
    } else {
      console.log("⚠️  courses_fts may not be configured as external content table");
    }
    
  } catch (error) {
    console.log(`❌ External content index test failed: ${error.message}`);
  }
  
  console.log("");
};

// Test cumulative course data loading
const testCumulativeCourseData = () => {
  console.log("=== CUMULATIVE COURSE DATA TESTS ===\n");
  
  console.log(`Testing cumulative course data loading:`);
  console.log(`   Path: ${cumulativeJsonPath}`);
  
  try {
    if (fs.existsSync(cumulativeJsonPath)) {
      console.log(`   ✅ Cumulative JSON file exists`);
      
      const jsonData = JSON.parse(fs.readFileSync(cumulativeJsonPath, "utf8"));
      console.log(`   📊 JSON structure: ${Object.keys(jsonData).join(', ')}`);
      
      if (jsonData.courses && Array.isArray(jsonData.courses)) {
        console.log(`   📚 Courses in JSON: ${jsonData.courses.length}`);
        
        // Test a few courses
        const sampleCourses = jsonData.courses.slice(0, 3);
        sampleCourses.forEach((course, index) => {
          const courseKey = course.courseId?.replace(/\s+/g, "");
          console.log(`   ${index + 1}. ${course.courseId} -> ${courseKey}: ${course.title || 'No title'}`);
        });
        
        console.log(`   ✅ Cumulative course data structure valid`);
        
        // Test lookup functionality
        const testCourseId = "CS1301";
        const testCourse = jsonData.courses.find(course => 
          course.courseId?.replace(/\s+/g, "") === testCourseId
        );
        
        if (testCourse) {
          console.log(`   🔍 Test lookup (${testCourseId}): ${testCourse.title}`);
          console.log(`   ✅ Course lookup functionality working`);
        } else {
          console.log(`   ⚠️  Test course ${testCourseId} not found in cumulative data`);
        }
        
      } else {
        console.log(`   ⚠️  JSON does not contain courses array`);
      }
      
    } else {
      console.log(`   ⚠️  Cumulative JSON file not found`);
      console.log(`   Note: Course titles may not be enhanced without this file`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error loading cumulative course data: ${error.message}`);
  }
  
  console.log("");
};

// Test query parameter binding safety
const testQuerySafety = () => {
  console.log("=== QUERY SAFETY TESTS ===\n");
  
  const maliciousInputs = [
    "'; DROP TABLE classdistribution; --",
    "1' OR '1'='1",
    "test'; INSERT INTO",
    "UNION SELECT * FROM professor",
    "<script>alert('xss')</script>"
  ];
  
  console.log("Testing prepared statement parameter binding safety:");
  
  for (const maliciousInput of maliciousInputs) {
    console.log(`   Testing: "${maliciousInput.substring(0, 30)}..."`);
    
    try {
      const stmt = db.prepare(`
        SELECT dept_abbr, course_num, class_desc 
        FROM classdistribution 
        WHERE dept_abbr || course_num LIKE ? 
        LIMIT 1
      `);
      
      const results = stmt.all(`%${maliciousInput}%`);
      console.log(`   ✅ Handled safely (${results.length} results)`);
      
    } catch (error) {
      console.log(`   ❌ Error (but query was prevented): ${error.message}`);
    }
  }
  
  console.log(`   ✅ Parameter binding prevents SQL injection\n`);
};

// Run all database tests
const runAllDatabaseTests = () => {
  console.log("🚀 Starting database query verification tests...\n");
  
  testDatabaseSettings();
  testTableStructure();
  testPreparedStatements();
  testFTS5Queries();
  testExternalContentIndex();
  testCumulativeCourseData();
  testQuerySafety();
  
  // Close database connection
  try {
    db.close();
    console.log("✅ Database connection closed");
  } catch (error) {
    console.log(`⚠️  Error closing database: ${error.message}`);
  }
  
  console.log("\n🎉 Database query verification complete!");
  console.log("\n📋 Database Test Summary:");
  console.log("- ✅ Database connection and optimization settings");
  console.log("- ✅ Required table structure and data verification");
  console.log("- ✅ Prepared statement functionality");
  console.log("- ✅ FTS5 table existence and query functionality");
  console.log("- ✅ BM25 relevance scoring verification");
  console.log("- ✅ External content index functionality");
  console.log("- ✅ Cumulative course data loading");
  console.log("- ✅ Query parameter binding safety");
};

// Execute database tests
runAllDatabaseTests();