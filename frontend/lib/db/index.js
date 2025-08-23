/**
 * Database Module Main Entry Point
 * 
 * This is the new modular database system that replaces the monolithic db.js
 * It maintains 100% backward compatibility while providing improved:
 * - Performance through optimized queries and caching
 * - Maintainability through modular architecture  
 * - Error handling through standardized fallbacks
 * - Monitoring through performance tracking
 */

// Import modular components
import { db } from './connection.js';
import { parseJSONFromRow, parseCourseCodesInText, getCourseInfo } from './parsers.js';
import { performanceMonitor } from './performance.js';
import { courseStatements, professorStatements, departmentStatements } from './statements/index.js';
import { getSearchFTS5, getSearchOptimized, getAutocompleteFTS5, getAutocomplete } from './search/index.js';

// Re-export commonly used utilities for backward compatibility
export { 
  parseJSONFromRow, 
  parseCourseCodesInText, 
  getCourseInfo,
  performanceMonitor
};

// Re-export search functions (main API)
export { getSearchFTS5, getSearchOptimized, getAutocompleteFTS5, getAutocomplete };

// Utility functions
const groupBy = (array, key) => {
  return Object.values(
    array.reduce((result, currentValue) => {
      // eslint-disable-next-line no-param-reassign
      (result[currentValue[key]] = result[currentValue[key]] || []).push(
        currentValue
      );
      return result;
    }, {})
  );
};

const summarizeTerms = (groupedDistributions) => {
  return groupedDistributions.map((distributions) => {
    const grades = {};
    const terms = distributions.map((distribution) => ({
      term: distribution.term,
      grades: distribution.grades,
      students: distribution.students,
    }));
    const students = terms.reduce((acc, term) => acc + term.students, 0);
    distributions.forEach((distribution) => {
      Object.keys(distribution.grades).forEach((grade) => {
        if (grades[grade]) {
          grades[grade] += distribution.grades[grade];
        } else {
          grades[grade] = distribution.grades[grade];
        }
      });
    });
    return { ...distributions[0], grades, terms, students };
  });
};

// Synchronous query function for better-sqlite3
const syncQuery = (query, params = {}) => {
  const stmt = db.prepare(query);
  return stmt.all(params);
};

// ======================= EXISTING FUNCTIONS (MAINTAINED FOR COMPATIBILITY) =======================

export const getDistribution = (classCode) => {
  const timer = performanceMonitor.time('getDistribution');
  
  try {
    const rows = courseStatements.courseDistribution.all({ class_name: classCode });
    const result = summarizeTerms(groupBy(rows.map(parseJSONFromRow), "professor_id"));
    timer();
    return result;
  } catch (error) {
    timer();
    console.error('Error in getDistribution:', error);
    return [];
  }
};

export const getClassInfo = (classCode) => {
  const timer = performanceMonitor.time('getClassInfo');
  
  try {
    const rows = courseStatements.courseInfo.all({ class_name: classCode });
    const parsedRows = rows.map(parseJSONFromRow);

    // Merge with cumulative course data
    const courseInfo = getCourseInfo(classCode);
    if (courseInfo && parsedRows.length > 0) {
      // Add the cumulative course information to the first row
      parsedRows[0] = {
        ...parsedRows[0],
        oscarTitle: courseInfo.title || null,
        oscarDesc: courseInfo.description || null,
        creditHours: courseInfo.creditHours || null,
        prerequisites: courseInfo.prerequisites || null,
        corequisites: courseInfo.corequisites || null,
        restrictions: courseInfo.restrictions || null,
      };
    }

    timer();
    return parsedRows;
  } catch (error) {
    timer();
    console.error('Error in getClassInfo:', error);
    return [];
  }
};

export const getEveryClassCode = () => {
  const timer = performanceMonitor.time('getEveryClassCode');
  
  try {
    const rows = courseStatements.allCourses.all();
    const parsedRows = rows.map(parseJSONFromRow);

    // Enhance classes with Oscar titles
    const enhancedRows = parsedRows.map((classItem) => {
      const classCode = `${classItem.dept_abbr}${classItem.course_num}`;
      const courseInfo = getCourseInfo(classCode);

      return {
        ...classItem,
        oscarTitle: courseInfo?.title || null,
        // Update class_desc to show the actual title instead of just the course code
        class_desc: courseInfo?.title || classItem.class_desc,
      };
    });

    timer();
    return enhancedRows;
  } catch (error) {
    timer();
    console.error('Error in getEveryClassCode:', error);
    return [];
  }
};

export const getEveryProfessorCode = () => {
  const timer = performanceMonitor.time('getEveryProfessorCode');
  
  try {
    const rows = professorStatements.allProfessors.all();
    const result = rows.map(parseJSONFromRow);
    timer();
    return result;
  } catch (error) {
    timer();
    console.error('Error in getEveryProfessorCode:', error);
    return [];
  }
};

export const getEveryDepartmentCode = () => {
  const timer = performanceMonitor.time('getEveryDepartmentCode');
  
  try {
    const rows = departmentStatements.allDepartments.all();
    const result = rows.map(parseJSONFromRow);
    timer();
    return result;
  } catch (error) {
    timer();
    console.error('Error in getEveryDepartmentCode:', error);
    return [];
  }
};

export const getDeptInfo = (deptCode) => {
  const timer = performanceMonitor.time('getDeptInfo');
  
  try {
    const rows = departmentStatements.deptInfo.all({ dept_code: deptCode.toUpperCase() });
    const result = rows.map(parseJSONFromRow);
    timer();
    return result;
  } catch (error) {
    timer();
    console.error('Error in getDeptInfo:', error);
    return [];
  }
};

export const getClassDistribtionsInDept = (deptCode) => {
  const timer = performanceMonitor.time('getClassDistribtionsInDept');
  
  try {
    const rows = departmentStatements.deptClasses.all({ dept_code: deptCode.toUpperCase() });
    const parsedRows = rows.map(parseJSONFromRow);

    // Enhance classes with Oscar titles
    const enhancedRows = parsedRows.map((classItem) => {
      if (!classItem.dept_abbr || !classItem.course_num) return classItem;

      const classCode = `${classItem.dept_abbr}${classItem.course_num}`;
      const courseInfo = getCourseInfo(classCode);

      return {
        ...classItem,
        oscarTitle: courseInfo?.title || null,
        // Update class_desc to show the actual title instead of just the course code
        class_desc: courseInfo?.title || classItem.class_desc,
      };
    });

    timer();
    return enhancedRows;
  } catch (error) {
    timer();
    console.error('Error in getClassDistribtionsInDept:', error);
    return [];
  }
};

export const getInstructorInfo = (instructorId) => {
  const timer = performanceMonitor.time('getInstructorInfo');
  
  try {
    const rows = professorStatements.instructorInfo.all({ instructor_id: instructorId });
    const result = rows.map(parseJSONFromRow);
    timer();
    return result;
  } catch (error) {
    timer();
    console.error('Error in getInstructorInfo:', error);
    return [];
  }
};

export const getInstructorClasses = (instructorId) => {
  const timer = performanceMonitor.time('getInstructorClasses');
  
  try {
    const rows = professorStatements.instructorClasses.all({ instructor_id: instructorId });
    const parsedRows = rows.map(parseJSONFromRow);

    // Enhance rows with cumulative course data
    const enhancedRows = parsedRows.map((classItem) => {
      if (!classItem.dept_abbr || !classItem.course_num) return classItem;

      const classCode = `${classItem.dept_abbr}${classItem.course_num}`;
      const courseInfo = getCourseInfo(classCode);

      return {
        ...classItem,
        oscarTitle: courseInfo?.title || null,
        // Update class_desc to show the actual title instead of just the course code
        class_desc: courseInfo?.title || classItem.class_desc,
      };
    });

    const result = summarizeTerms(groupBy(enhancedRows, "class_id"));
    timer();
    return result;
  } catch (error) {
    timer();
    console.error('Error in getInstructorClasses:', error);
    return [];
  }
};