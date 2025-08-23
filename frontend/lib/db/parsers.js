/**
 * Data Parsing and Transformation Module
 * Utilities for parsing JSON data and transforming database rows
 */

import fs from "fs";
import path from "path";
import { CACHE, GPA_MAP } from '../constants.js';

// Course data caching
let cumulativeCourseData = null;
let cumulativeDataLoadTime = null;

const cumulativeJsonPath = path.resolve(
  process.cwd(),
  "../data-app/COURSE_INFO/cumulative.json"
);

// Improved JSON parsing without double-parsing bug
export const tryJSONParse = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback !== null ? fallback : str;
  }
};

// Parse JSON fields from database row
export const parseJSONFromRow = (row) => {
  const newRow = { ...row };
  if (row.grades) newRow.grades = tryJSONParse(row.grades);
  if (row.total_grades) newRow.total_grades = tryJSONParse(row.total_grades);
  if (row.libEds !== undefined) newRow.libEds = tryJSONParse(row.libEds, []);
  return newRow;
};

// Load cumulative course data with caching
export const loadCumulativeCourseData = () => {
  const now = Date.now();

  // Cache for configured TTL to improve performance
  if (
    cumulativeCourseData &&
    cumulativeDataLoadTime &&
    now - cumulativeDataLoadTime < CACHE.TTL_MS
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
      console.error("Error loading cumulative course data:", error);
    }
  }

  return new Map();
};

// Get course info by class code
export const getCourseInfo = (classCode) => {
  const courseMap = loadCumulativeCourseData();
  return courseMap.get(classCode.replace(/\s+/g, "")) || null;
};

// Parse course codes from text
export const parseCourseCodesInText = (text) => {
  if (!text) return [];

  // Regex to match course codes like "ACCT 2101" or "MATH 1501"
  const courseCodeRegex = /([A-Z]{2,4})\s+(\d{4}[A-Z]?)/g;
  const matches = [];
  let match;

  // Use assignment in condition pattern with explicit null check
  // eslint-disable-next-line no-cond-assign
  while ((match = courseCodeRegex.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      deptCode: match[1],
      courseNumber: match[2],
      classCode: `${match[1]}${match[2]}`, // For URL
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
};

// Extract grades array from various formats
export const extractGradesArray = (allGrades) => {
  if (!allGrades) return [];
  
  if (Array.isArray(allGrades)) {
    return allGrades.filter(g => g !== null);
  }
  
  if (typeof allGrades === 'string') {
    try {
      const parsed = JSON.parse(allGrades);
      return Array.isArray(parsed) ? parsed.filter(g => g !== null) : [];
    } catch (e) {
      return [];
    }
  }
  
  return [];
};

// Calculate aggregate statistics from grades
export const calculateAggregateStats = (allGrades) => {
  if (!allGrades || !Array.isArray(allGrades)) {
    return { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };
  }

  const combinedGrades = {};
  let totalStudents = 0;

  allGrades.forEach((gradeData) => {
    if (gradeData && typeof gradeData === "object") {
      Object.entries(gradeData).forEach(([grade, count]) => {
        if (typeof count === "number") {
          combinedGrades[grade] = (combinedGrades[grade] || 0) + count;
          totalStudents += count;
        }
      });
    }
  });

  if (totalStudents === 0) {
    return { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };
  }

  const impactingGrades = Object.entries(combinedGrades).filter(([grade]) =>
    Object.keys(GPA_MAP).includes(grade)
  );

  const totalImpactingStudents = impactingGrades.reduce(
    (acc, [, count]) => acc + count,
    0
  );

  let averageGPA = 0;
  if (totalImpactingStudents > 0) {
    averageGPA = parseFloat(
      (
        impactingGrades.reduce(
          (acc, [grade, count]) => acc + GPA_MAP[grade] * count,
          0
        ) / totalImpactingStudents
      ).toFixed(2)
    );
  }

  const mostCommonEntry = Object.entries(combinedGrades).reduce(
    (acc, [grade, count]) => (count > acc[1] ? [grade, count] : acc),
    ["", 0]
  );

  return {
    averageGPA,
    mostStudents: mostCommonEntry[0],
    mostStudentsPercent: parseFloat(
      ((100 * mostCommonEntry[1]) / totalStudents).toFixed(1)
    ),
  };
};