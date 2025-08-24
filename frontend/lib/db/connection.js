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
    const stmt = db.prepare(query);
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
    if (JSON.parse(str)) return JSON.parse(str);
    return err;
  } catch (e) {
    if (err) return err;
    return str;
  }
};

export { db, promisedQuery, getCourseInfo, tryJSONParse };