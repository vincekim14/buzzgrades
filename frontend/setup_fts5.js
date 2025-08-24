#!/usr/bin/env node

/**
 * Database setup script for FTS5 search optimization
 * This script creates the FTS5 virtual table and applies performance optimizations
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data-app/ProcessedData.db');
const cumulativeJsonPath = path.resolve(__dirname, '../data-app/COURSE_INFO/cumulative.json');

console.log('🚀 Setting up FTS5 search optimization...');

// Create writable database connection
const db = new Database(dbPath, { fileMustExist: true });

try {
  console.log('📊 Applying SQLite performance optimizations...');
  
  // Apply performance optimizations from db-update.md
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB
  
  console.log('✅ Performance optimizations applied');
  
  console.log('📖 Loading cumulative course data...');
  
  // Load course titles from JSON
  let courseMap = new Map();
  if (fs.existsSync(cumulativeJsonPath)) {
    const jsonData = JSON.parse(fs.readFileSync(cumulativeJsonPath, 'utf8'));
    
    if (jsonData.courses) {
      jsonData.courses.forEach((course) => {
        // Remove space from courseId for consistent lookup (e.g., "ACCT 2101" -> "ACCT2101")
        const courseKey = course.courseId.replace(/\s+/g, '');
        courseMap.set(courseKey, {
          title: course.title,
          description: course.description,
          creditHours: course.creditHours
        });
      });
    }
    
    console.log(`✅ Loaded ${courseMap.size} course titles from JSON`);
  } else {
    console.warn('⚠️  Cumulative course JSON not found, continuing without course titles');
  }
  
  console.log('🏗️  Creating FTS5 virtual tables...');
  
  // Drop existing FTS5 tables if they exist
  try {
    db.prepare('DROP TABLE IF EXISTS courses_fts').run();
    db.prepare('DROP TABLE IF EXISTS professors_fts').run();
    db.prepare('DROP TABLE IF EXISTS departments_fts').run();
  } catch (err) {
    // Ignore error if tables don't exist
  }
  
  // Create courses FTS5 virtual table
  const createCoursesFtsTable = `
    CREATE VIRTUAL TABLE courses_fts USING fts5(
      class_id,
      dept_name,
      dept_abbr,
      course_num,
      course_title,
      course_description,
      instructor_id,
      instructor_name,
      total_students,
      tokenize = 'porter ascii'
    )
  `;
  
  // Create professors FTS5 virtual table
  const createProfessorsFtsTable = `
    CREATE VIRTUAL TABLE professors_fts USING fts5(
      name,
      tokenize = 'porter ascii'
    )
  `;
  
  // Create departments FTS5 virtual table
  const createDepartmentsFtsTable = `
    CREATE VIRTUAL TABLE departments_fts USING fts5(
      dept_abbr,
      dept_name,
      tokenize = 'porter ascii'
    )
  `;
  
  db.prepare(createCoursesFtsTable).run();
  db.prepare(createProfessorsFtsTable).run();
  db.prepare(createDepartmentsFtsTable).run();
  console.log('✅ FTS5 virtual tables created (courses, professors, departments)');
  
  console.log('📝 Populating FTS5 table with denormalized data...');
  
  // Get all unique courses with their instructors
  const getCoursesQuery = `
    SELECT DISTINCT
      c.id as class_id,
      dd.dept_name,
      c.dept_abbr,
      c.course_num,
      c.class_desc,
      c.total_students,
      p.id as instructor_id,
      p.name as instructor_name
    FROM classdistribution c
    LEFT JOIN departmentdistribution dd ON c.dept_abbr = dd.dept_abbr
    LEFT JOIN distribution d ON c.id = d.class_id
    LEFT JOIN professor p ON d.instructor_id = p.id
    WHERE c.total_students > 0
  `;
  
  const courses = db.prepare(getCoursesQuery).all();
  console.log(`📊 Found ${courses.length} course-instructor combinations to index`);
  
  // Prepare insert statement for FTS5 table
  const insertFts = db.prepare(`
    INSERT INTO courses_fts (
      class_id, dept_name, dept_abbr, course_num, course_title, course_description,
      instructor_id, instructor_name, total_students
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Start transaction for better performance
  const insertMany = db.transaction((courses) => {
    for (const course of courses) {
      const courseKey = `${course.dept_abbr}${course.course_num}`;
      const courseInfo = courseMap.get(courseKey);
      
      insertFts.run([
        course.class_id,
        course.dept_name || '',
        course.dept_abbr,
        course.course_num,
        courseInfo?.title || course.class_desc || '',
        courseInfo?.description || '',
        course.instructor_id || null,
        course.instructor_name || '',
        course.total_students
      ]);
    }
  });
  
  // Execute the transaction
  insertMany(courses);
  
  console.log('✅ Courses FTS5 table populated successfully');
  
  // Populate professors FTS5 table
  console.log('📝 Populating professors FTS5 table...');
  const getProfessorsQuery = `
    SELECT DISTINCT id, name
    FROM professor
    WHERE name IS NOT NULL AND name != ''
  `;
  
  const professors = db.prepare(getProfessorsQuery).all();
  console.log(`📊 Found ${professors.length} professors to index`);
  
  const insertProfessorsFts = db.prepare(`
    INSERT INTO professors_fts (rowid, name) VALUES (?, ?)
  `);
  
  const insertProfessors = db.transaction((professors) => {
    for (const prof of professors) {
      insertProfessorsFts.run([prof.id, prof.name]);
    }
  });
  
  insertProfessors(professors);
  console.log('✅ Professors FTS5 table populated successfully');
  
  // Populate departments FTS5 table
  console.log('📝 Populating departments FTS5 table...');
  const getDepartmentsQuery = `
    SELECT DISTINCT dept_abbr, dept_name
    FROM departmentdistribution
    WHERE dept_abbr IS NOT NULL AND dept_name IS NOT NULL
  `;
  
  const departments = db.prepare(getDepartmentsQuery).all();
  console.log(`📊 Found ${departments.length} departments to index`);
  
  const insertDepartmentsFts = db.prepare(`
    INSERT INTO departments_fts (dept_abbr, dept_name) VALUES (?, ?)
  `);
  
  const insertDepartments = db.transaction((departments) => {
    for (const dept of departments) {
      insertDepartmentsFts.run([dept.dept_abbr, dept.dept_name]);
    }
  });
  
  insertDepartments(departments);
  console.log('✅ Departments FTS5 table populated successfully');
  
  // Run ANALYZE to update query planner statistics
  console.log('📈 Running ANALYZE to update statistics...');
  db.prepare('ANALYZE').run();
  
  // Run PRAGMA optimize
  console.log('⚡ Running PRAGMA optimize...');
  db.prepare('PRAGMA optimize').run();
  
  // Get some statistics
  const coursesCount = db.prepare('SELECT COUNT(*) as count FROM courses_fts').get();
  const professorsCount = db.prepare('SELECT COUNT(*) as count FROM professors_fts').get();
  const departmentsCount = db.prepare('SELECT COUNT(*) as count FROM departments_fts').get();
  const dbSize = fs.statSync(dbPath).size / (1024 * 1024); // MB
  
  console.log('\n🎉 FTS5 setup completed successfully!');
  console.log(`📊 Statistics:`);
  console.log(`   - Courses FTS5 entries: ${coursesCount.count}`);
  console.log(`   - Professors FTS5 entries: ${professorsCount.count}`);
  console.log(`   - Departments FTS5 entries: ${departmentsCount.count}`);
  console.log(`   - Database size: ${dbSize.toFixed(2)} MB`);
  console.log(`   - Journal mode: ${db.pragma('journal_mode', { simple: true })}`);
  console.log(`   - Synchronous: ${db.pragma('synchronous', { simple: true })}`);
  
} catch (error) {
  console.error('❌ Error setting up FTS5:', error);
  process.exit(1);
} finally {
  db.close();
}