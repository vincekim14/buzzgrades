#!/usr/bin/env node

/**
 * FTS5 Database Setup Script
 * 
 * This script creates FTS5 virtual tables for high-performance search.
 * Run this once after making the database writable.
 * 
 * Usage: node scripts/setup-fts5.js
 * 
 * Prerequisites:
 * - Database must be writable: chmod 644 ../data-app/ProcessedData.db
 * - better-sqlite3 package installed
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path (same as main application)
const dbPath = path.resolve(__dirname, "../../data-app/ProcessedData.db");
const cumulativeJsonPath = path.resolve(
  __dirname,
  "../../data-app/COURSE_INFO/cumulative.json"
);

console.log("🚀 Starting FTS5 Setup...");
console.log(`Database: ${dbPath}`);

// Check if database exists and is writable
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database not found: ${dbPath}`);
  process.exit(1);
}

try {
  fs.accessSync(dbPath, fs.constants.W_OK);
  console.log("✅ Database is writable");
} catch (error) {
  console.error("❌ Database is not writable. Run: chmod 644 ../data-app/ProcessedData.db");
  process.exit(1);
}

// Initialize database connection (writable)
const db = new Database(dbPath, { readonly: false });

console.log("\n📊 Setting up SQLite optimizations...");

try {
  // Apply SQLite optimizations
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB
  db.pragma('cache_size = 10000');
  
  console.log("✅ SQLite optimizations applied");
} catch (error) {
  console.warn("⚠️ Some SQLite optimizations failed:", error.message);
}

console.log("\n🔍 Creating FTS5 virtual tables...");

// Load cumulative course data for Oscar titles
let courseMap = new Map();
try {
  if (fs.existsSync(cumulativeJsonPath)) {
    const jsonData = JSON.parse(fs.readFileSync(cumulativeJsonPath, "utf8"));
    if (jsonData.courses) {
      jsonData.courses.forEach((course) => {
        const courseKey = course.courseId.replace(/\s+/g, "");
        courseMap.set(courseKey, course);
      });
    }
    console.log(`✅ Loaded ${courseMap.size} course titles from JSON`);
  }
} catch (error) {
  console.warn("⚠️ Could not load course JSON data:", error.message);
}

try {
  // 1. Create Courses FTS5 table
  console.log("Creating courses_fts table...");
  
  // Drop existing table if it exists
  db.exec("DROP TABLE IF EXISTS courses_fts;");
  
  // Create courses FTS5 virtual table with external content
  db.exec(`
    CREATE VIRTUAL TABLE courses_fts USING fts5(
      course_code,      -- "CS1301", "MATH1501"
      course_name,      -- "CS 1301", "MATH 1501"  
      class_desc,       -- Original descriptions
      oscar_title,      -- Full course titles from JSON
      department,       -- "CS", "MATH"
      class_id,         -- Reference to classdistribution.id for joins
      tokenize = "unicode61 remove_diacritics 2",
      prefix = '2 3 4'
    );
  `);

  // Populate courses FTS5 table
  console.log("Populating courses_fts table...");
  const courseStmt = db.prepare(`
    INSERT INTO courses_fts(course_code, course_name, class_desc, oscar_title, department, class_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const courses = db.prepare("SELECT id, dept_abbr, course_num, class_desc FROM classdistribution").all();
  
  const courseTransaction = db.transaction((courses) => {
    for (const course of courses) {
      const courseCode = `${course.dept_abbr}${course.course_num}`;
      const courseName = `${course.dept_abbr} ${course.course_num}`;
      const courseInfo = courseMap.get(courseCode);
      const oscarTitle = courseInfo?.title || null;
      
      courseStmt.run(
        courseCode,
        courseName, 
        course.class_desc,
        oscarTitle,
        course.dept_abbr,
        course.id
      );
    }
  });

  courseTransaction(courses);
  console.log(`✅ Populated courses_fts with ${courses.length} courses`);

  // 2. Create Professors FTS5 table
  console.log("Creating professors_fts table...");
  
  db.exec("DROP TABLE IF EXISTS professors_fts;");
  
  db.exec(`
    CREATE VIRTUAL TABLE professors_fts USING fts5(
      name,             -- Full professor names
      tokenize = "unicode61 remove_diacritics 2",
      prefix = '2 3 4'
    );
  `);

  // Populate professors FTS5 table
  console.log("Populating professors_fts table...");
  const professorStmt = db.prepare(`
    INSERT INTO professors_fts(rowid, name) VALUES (?, ?)
  `);

  const professors = db.prepare("SELECT id, name FROM professor").all();
  
  const profTransaction = db.transaction((professors) => {
    for (const prof of professors) {
      professorStmt.run(prof.id, prof.name);
    }
  });

  profTransaction(professors);
  console.log(`✅ Populated professors_fts with ${professors.length} professors`);

  // 3. Create Departments FTS5 table
  console.log("Creating departments_fts table...");
  
  db.exec("DROP TABLE IF EXISTS departments_fts;");
  
  db.exec(`
    CREATE VIRTUAL TABLE departments_fts USING fts5(
      dept_abbr,        -- "CS", "ECE"
      dept_name,        -- "Computer Science", "Electrical Engineering"
      tokenize = "unicode61 remove_diacritics 2",
      prefix = '2 3 4'
    );
  `);

  // Populate departments FTS5 table
  console.log("Populating departments_fts table...");
  const deptStmt = db.prepare(`
    INSERT INTO departments_fts(dept_abbr, dept_name) VALUES (?, ?)
  `);

  const departments = db.prepare("SELECT DISTINCT dept_abbr, dept_name FROM departmentdistribution").all();
  
  const deptTransaction = db.transaction((departments) => {
    for (const dept of departments) {
      deptStmt.run(dept.dept_abbr, dept.dept_name);
    }
  });

  deptTransaction(departments);
  console.log(`✅ Populated departments_fts with ${departments.length} departments`);

} catch (error) {
  console.error("❌ Error creating FTS5 tables:", error);
  process.exit(1);
}

console.log("\n🧪 Testing FTS5 tables...");

try {
  // Test courses FTS5
  const testCourse = db.prepare("SELECT COUNT(*) as count FROM courses_fts WHERE courses_fts MATCH 'CS*'").get();
  console.log(`✅ Courses FTS5 test: Found ${testCourse.count} CS courses`);

  // Test professors FTS5  
  const testProf = db.prepare("SELECT COUNT(*) as count FROM professors_fts WHERE professors_fts MATCH 'John*'").get();
  console.log(`✅ Professors FTS5 test: Found ${testProf.count} professors starting with 'John'`);

  // Test departments FTS5
  const testDept = db.prepare("SELECT COUNT(*) as count FROM departments_fts WHERE departments_fts MATCH 'Computer*'").get();
  console.log(`✅ Departments FTS5 test: Found ${testDept.count} departments containing 'Computer'`);

} catch (error) {
  console.error("❌ FTS5 testing failed:", error);
}

console.log("\n📈 Performance comparison test...");

try {
  // Time LIKE query vs FTS5 query
  console.time("LIKE Query");
  const likeResults = db.prepare("SELECT COUNT(*) as count FROM classdistribution WHERE dept_abbr || course_num LIKE '%CS%'").get();
  console.timeEnd("LIKE Query");
  
  console.time("FTS5 Query");
  const fts5Results = db.prepare("SELECT COUNT(*) as count FROM courses_fts WHERE courses_fts MATCH 'CS*'").get();
  console.timeEnd("FTS5 Query");
  
  console.log(`LIKE results: ${likeResults.count}, FTS5 results: ${fts5Results.count}`);
} catch (error) {
  console.warn("⚠️ Performance test failed:", error.message);
}

// Close database connection
db.close();

console.log("\n🎉 FTS5 setup complete!");
console.log("\nNext steps:");
console.log("1. Make database read-only: chmod 444 ../data-app/ProcessedData.db");
console.log("2. Update lib/db.js to use FTS5 queries");
console.log("3. Test the application with FTS5 search");

console.log("\nFor future data updates, run:");
console.log("1. chmod 644 ../data-app/ProcessedData.db");
console.log("2. Update your data");
console.log("3. node scripts/sync-fts5.js");
console.log("4. chmod 444 ../data-app/ProcessedData.db");