import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Get the database from the root of the repo
const dbPath = path.resolve(process.cwd(), "../data-app/ProcessedData.db");
const cumulativeJsonPath = path.resolve(
  process.cwd(),
  "../data-app/COURSE_INFO/cumulative.json"
);

// Initialize database with better-sqlite3
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

// Prepared statement cache for performance
const stmtCache = new Map();

// Pre-warm database connection and common queries to reduce cold start
const preWarmDatabase = () => {
  try {
    // Test basic connection
    db.exec('SELECT 1');
    
    // Pre-compile parameterized FTS5 query templates that mirror fts-search.js
    // These match the actual queries used in production for maximum statement reuse
    const fts5Templates = [
      // Course search templates (from fts-search.js)
      'SELECT DISTINCT cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department, 1000 as relevance_score FROM courses_fts cf WHERE courses_fts MATCH @exact_course_pattern ORDER BY cf.course_code ASC LIMIT 7',
      'SELECT DISTINCT cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department, 1000 as relevance_score FROM courses_fts cf WHERE courses_fts MATCH @dept_pattern AND cf.department = @dept_abbr ORDER BY cf.course_code ASC LIMIT 7',
      'SELECT DISTINCT cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department, 1000 as relevance_score FROM courses_fts cf WHERE courses_fts MATCH @course_pattern ORDER BY cf.course_code ASC LIMIT 7',
      'SELECT cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department, (ABS(bm25(courses_fts)) * 2.0) as relevance_score FROM courses_fts cf WHERE courses_fts MATCH @search_term ORDER BY relevance_score DESC LIMIT 7',
      'SELECT cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department, (ABS(bm25(courses_fts)) * 2.0) as relevance_score FROM courses_fts cf WHERE courses_fts MATCH @search_term AND department = @dept_abbr ORDER BY relevance_score DESC LIMIT 7',
      
      // Instructor search templates (from fts-search.js)
      'SELECT p.id as instructor_id, p.name as instructor_name, p.RMP_score, (ABS(bm25(professors_fts)) * 10.0) as relevance_score FROM professors_fts pf JOIN professor p ON pf.rowid = p.id WHERE professors_fts MATCH @search_term ORDER BY relevance_score DESC LIMIT 7',
      'SELECT DISTINCT p.id as instructor_id, p.name as instructor_name, p.RMP_score, 400 as relevance_score, COUNT(DISTINCT c.id) as course_count FROM professor p JOIN distribution d ON p.id = d.instructor_id JOIN classdistribution c ON d.class_id = c.id WHERE c.dept_abbr = @dept_abbr AND p.name IS NOT NULL AND p.name != \'\' GROUP BY p.id ORDER BY course_count DESC, p.RMP_score DESC LIMIT 4',
      'SELECT DISTINCT p.id as instructor_id, p.name as instructor_name, p.RMP_score, 500 as relevance_score FROM professor p JOIN distribution d ON p.id = d.instructor_id JOIN classdistribution c ON d.class_id = c.id WHERE c.dept_abbr = @dept_abbr AND p.name IS NOT NULL AND p.name != \'\' LIMIT 7',
      'SELECT DISTINCT p.id as instructor_id, p.name as instructor_name, p.RMP_score, 500 as relevance_score FROM professor p JOIN distribution d ON p.id = d.instructor_id JOIN classdistribution c ON d.class_id = c.id WHERE c.dept_abbr = @dept_abbr AND c.course_num = @course_num AND p.name IS NOT NULL AND p.name != \'\' LIMIT 7',
      
      // Department search templates (from fts-search.js)
      'SELECT DISTINCT dept_name, dept_abbr, 1200 as relevance_score FROM departments_fts WHERE departments_fts MATCH @dept_pattern LIMIT 7',
      'SELECT dept_name, dept_abbr, (ABS(bm25(departments_fts)) * 5.0) as relevance_score FROM departments_fts WHERE departments_fts MATCH @search_term ORDER BY relevance_score DESC LIMIT 7'
    ];
    
    // Pre-compile legacy queries for fallback compatibility
    const legacyQueries = [
      'SELECT name FROM professors_fts WHERE professors_fts MATCH ? LIMIT 1',
      'SELECT dept_name, dept_abbr FROM departments_fts WHERE departments_fts MATCH ? LIMIT 1',
      'SELECT course_code FROM courses_fts WHERE courses_fts MATCH ? LIMIT 1'
    ];
    
    // Pre-prepare all FTS5 templates
    fts5Templates.forEach(query => {
      try {
        const stmt = db.prepare(query);
        stmtCache.set(query, stmt);
      } catch (err) {
        // Log but don't fail warmup for individual query issues
        console.warn(`⚠️ Failed to prepare FTS5 template: ${query.substring(0, 50)}...`, err.message);
      }
    });
    
    // Pre-prepare legacy queries
    legacyQueries.forEach(query => {
      try {
        const stmt = db.prepare(query);
        stmtCache.set(query, stmt);
      } catch (err) {
        console.warn(`⚠️ Failed to prepare legacy query: ${query}`, err.message);
      }
    });
    
    console.log(`✅ Database pre-warmed successfully (${fts5Templates.length + legacyQueries.length} statements prepared)`);
  } catch (error) {
    console.error('❌ Database pre-warm failed:', error);
  }
};

// Pre-warm on module load
preWarmDatabase();

// Boot logging for first 3 requests with timing breakdown (CLAUDE.md cold start mitigation)
let bootRequestCount = 0;
const BOOT_LOG_LIMIT = 3;
const bootStartTime = Date.now();

const logBootRequest = (endpoint, totalDuration, dbDuration) => {
  if (bootRequestCount < BOOT_LOG_LIMIT) {
    bootRequestCount++;
    const timeSinceBoot = Date.now() - bootStartTime;
    
    console.log(`🚀 BOOT REQUEST ${bootRequestCount}/${BOOT_LOG_LIMIT}: ${endpoint}`);
    console.log(`   └─ Total: ${totalDuration}ms, DB: ${dbDuration || 'N/A'}ms, Since boot: ${timeSinceBoot}ms`);
    
    if (bootRequestCount === BOOT_LOG_LIMIT) {
      console.log(`✅ Boot logging complete after ${BOOT_LOG_LIMIT} requests`);
    }
  }
};

let cumulativeCourseData = null;
let cumulativeDataLoadTime = null;

const loadCumulativeCourseData = () => {
  const now = Date.now();

  // Cache for 1 hour to improve performance
  if (
    cumulativeCourseData &&
    cumulativeDataLoadTime &&
    now - cumulativeDataLoadTime < 3600000
  ) {
    return cumulativeCourseData;
  }

  try {
    if (fs.existsSync(cumulativeJsonPath)) {
      const jsonData = JSON.parse(fs.readFileSync(cumulativeJsonPath, "utf8"));

      // Create a map for quick lookup by courseId
      const courseMap = new Map();
      if (jsonData.courses) {
        jsonData.courses.forEach((course) => {
          // Remove space from courseId for consistent lookup (e.g., "ACCT 2101" -> "ACCT2101")
          const courseKey = course.courseId.replace(/\s+/g, "");
          courseMap.set(courseKey, course);
        });
      }

      cumulativeCourseData = courseMap;
      cumulativeDataLoadTime = now;
      return courseMap;
    }
  } catch (error) {
    // Log error in development, but don't expose in production
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("Error loading cumulative course data:", error);
    }
  }

  return new Map();
};

const getCourseInfo = (classCode) => {
  const courseMap = loadCumulativeCourseData();
  return courseMap.get(classCode.replace(/\s+/g, "")) || null;
};

// Better-sqlite3 is synchronous, but we'll wrap in Promise for API compatibility
const promisedQuery = (query, params = {}) => {
  try {
    // Use cached prepared statement for performance
    let stmt = stmtCache.get(query);
    if (!stmt) {
      stmt = db.prepare(query);
      stmtCache.set(query, stmt);
      
      // Limit cache size to prevent memory leaks
      if (stmtCache.size > 100) {
        const firstKey = stmtCache.keys().next().value;
        stmtCache.delete(firstKey);
      }
    }
    
    // Handle both array and object parameters for better-sqlite3
    if (Array.isArray(params)) {
      return Promise.resolve(stmt.all(...params));
    } else {
      return Promise.resolve(stmt.all(params));
    }
  } catch (error) {
    return Promise.reject(error);
  }
};

const tryJSONParse = (str, err) => {
  try {
    const parsed = JSON.parse(str);
    if (parsed) return parsed;
    return err;
  } catch (e) {
    if (err) return err;
    return str;
  }
};

export { db, promisedQuery, getCourseInfo, tryJSONParse, logBootRequest };