#!/usr/bin/env node

/**
 * FTS5 Sync Script
 * 
 * This script synchronizes FTS5 virtual tables with updated data.
 * Run this after updating course data, grades, or professor information.
 * 
 * Usage: node scripts/sync-fts5.js
 * 
 * Prerequisites:
 * - Database must be writable: chmod 644 ../data-app/ProcessedData.db
 * - FTS5 tables must already exist (run setup-fts5.js first if needed)
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

console.log("🔄 Starting FTS5 Sync...");
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

// Initialize database connection
const db = new Database(dbPath);

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

// Check if FTS5 tables exist
console.log("\n🔍 Checking FTS5 tables...");
const tables = ['courses_fts', 'professors_fts', 'departments_fts'];
let missingTables = [];

for (const table of tables) {
  try {
    db.prepare(`SELECT COUNT(*) FROM ${table} LIMIT 1`).get();
    console.log(`✅ ${table} exists`);
  } catch (error) {
    console.log(`❌ ${table} missing`);
    missingTables.push(table);
  }
}

if (missingTables.length > 0) {
  console.error(`\n❌ Missing FTS5 tables: ${missingTables.join(', ')}`);
  console.error("Run setup-fts5.js first to create the FTS5 tables");
  process.exit(1);
}

console.log("\n🔄 Synchronizing FTS5 tables...");

try {
  // 1. Sync Courses FTS5 table
  console.log("Syncing courses_fts table...");
  
  // Clear and rebuild courses FTS5 table
  db.exec("DELETE FROM courses_fts;");
  
  const courseStmt = db.prepare(`
    INSERT INTO courses_fts(course_code, course_name, class_desc, oscar_title, department)
    VALUES (?, ?, ?, ?, ?)
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
        course.dept_abbr
      );
    }
  });

  courseTransaction(courses);
  console.log(`✅ Synced courses_fts with ${courses.length} courses`);

  // 2. Sync Professors FTS5 table
  console.log("Syncing professors_fts table...");
  
  db.exec("DELETE FROM professors_fts;");
  
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
  console.log(`✅ Synced professors_fts with ${professors.length} professors`);

  // 3. Sync Departments FTS5 table
  console.log("Syncing departments_fts table...");
  
  db.exec("DELETE FROM departments_fts;");
  
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
  console.log(`✅ Synced departments_fts with ${departments.length} departments`);

} catch (error) {
  console.error("❌ Error syncing FTS5 tables:", error);
  process.exit(1);
}

console.log("\n🧪 Testing synced FTS5 tables...");

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

// Close database connection
db.close();

console.log("\n🎉 FTS5 sync complete!");
console.log("\nNext steps:");
console.log("1. Make database read-only: chmod 444 ../data-app/ProcessedData.db");
console.log("2. Restart your application to use updated search indexes");

console.log("\nFor future data updates, run this script again after:");
console.log("1. chmod 644 ../data-app/ProcessedData.db");
console.log("2. Update your course/grade/professor data");
console.log("3. node scripts/sync-fts5.js");
console.log("4. chmod 444 ../data-app/ProcessedData.db");