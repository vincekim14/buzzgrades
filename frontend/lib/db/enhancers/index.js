/**
 * Data Enhancement Functions Module
 * Reusable functions for enhancing database results with statistics and metadata
 */

import { parseJSONFromRow, getCourseInfo, extractGradesArray, calculateAggregateStats } from '../parsers.js';
import { SEARCH_LIMITS } from '../../constants.js';

// Enhanced course title matching (optimized)
export const titleMatchesSearchOptimized = (courseTitle, searchQuery) => {
  if (!courseTitle || !searchQuery) return false;

  const title = courseTitle.toLowerCase();
  const query = searchQuery.toLowerCase().trim();

  if (title.includes(query)) return true;

  if (query.includes(" ")) {
    const queryWords = query.split(/\s+/).filter((word) => word.length > 2);
    const matchedWords = queryWords.filter((word) => title.includes(word));
    return matchedWords.length >= Math.min(2, queryWords.length);
  }

  return false;
};

// Enhanced course processing with Oscar titles and stats - reusable function
export const enhanceCoursesWithStats = (courses, originalSearch = '') => {
  // Limit processing to avoid memory issues
  const coursesToProcess = courses.slice(0, SEARCH_LIMITS.PROCESSING_LIMIT);
  
  return coursesToProcess.map(parseJSONFromRow).map((classItem) => {
    const classCode = `${classItem.dept_abbr}${classItem.course_num}`;
    const courseInfo = getCourseInfo(classCode);

    const combinedGrades = classItem.total_grades || {};
    let totalStudents = 0;
    Object.values(combinedGrades).forEach((count) => {
      if (typeof count === "number") {
        totalStudents += count;
      }
    });

    let stats = { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };
    if (totalStudents > 0) {
      stats = calculateAggregateStats([combinedGrades]);
    }

    const courseTitle = courseInfo?.title || classItem.class_desc;
    let relevanceScore = Math.log(Math.max(classItem.total_students, 1)) * 100;

    if (titleMatchesSearchOptimized(courseTitle, originalSearch)) {
      relevanceScore += 10000;
    }

    if (originalSearch) {
      const searchUpper = originalSearch.replace(/\s/g, "").toUpperCase();
      const courseCode = `${classItem.dept_abbr}${classItem.course_num}`;
      if (courseCode.includes(searchUpper)) {
        relevanceScore += 20000;
      }
    }

    return {
      ...classItem,
      oscarTitle: courseInfo?.title || null,
      class_desc: courseTitle,
      ...stats,
      relevanceScore,
    };
  });
};

// Enhanced professors with statistics - reusable function
export const enhanceProfessorsWithStats = (professors) => {
  return professors.map(parseJSONFromRow).map(profItem => {
    const allGrades = extractGradesArray(profItem.all_grades);
    const stats = calculateAggregateStats(allGrades);
    
    return {
      ...profItem,
      ...stats,
    };
  });
};

// Enhanced departments with statistics - reusable function
export const enhanceDepartmentsWithStats = (departments) => {
  return departments.map(parseJSONFromRow).map(deptItem => {
    const allGrades = extractGradesArray(deptItem.all_grades);
    const stats = calculateAggregateStats(allGrades);
    
    return {
      ...deptItem,
      ...stats,
    };
  });
};

// Enhanced courses with Oscar titles for autocomplete
export const enhanceCoursesWithTitles = (courses) => {
  return courses.map(course => {
    const classCode = `${course.dept_abbr}${course.course_num}`;
    const courseInfo = getCourseInfo(classCode);
    return {
      ...course,
      oscarTitle: courseInfo?.title || null,
      class_desc: courseInfo?.title || course.class_desc
    };
  });
};