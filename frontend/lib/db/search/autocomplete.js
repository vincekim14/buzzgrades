/**
 * Autocomplete Search Implementation
 * Optimized autocomplete with FTS5 and LIKE fallbacks
 */

import { searchCache, autocompleteCache } from '../cache.js';
import { executeWithFallback, safeExecute } from '../error-handling.js';
import { executeWithPerformanceTracking } from '../performance.js';
import { toFTS5Query } from './fts5-query-builder.js';
import { 
  courseStatements, 
  professorStatements, 
  departmentStatements,
  fts5Statements, 
  hasFTS5Tables,
  getBatchCourseDetails 
} from '../statements/index.js';
import { enhanceCoursesWithTitles } from '../enhancers/index.js';
import { parseJSONFromRow } from '../parsers.js';

// FTS5-optimized autocomplete function with improved error handling
export const getAutocompleteFTS5 = (search) => {
  const cacheKey = `autocomplete-fts5:${search}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached) return cached;

  const { result, success } = safeExecute(() => {
    // Check if FTS5 is available
    if (!hasFTS5Tables()) {
      return getAutocomplete(search); // Fallback to original function
    }

    const fts5QueryObj = toFTS5Query(search);
    
    let courses = [];
    let professors = [];  
    let departments = [];

    if (fts5QueryObj) {
      const fts5Query = fts5QueryObj.query;
      
      // Use optimized fast queries for exact course codes
      if (fts5QueryObj.useFastQuery && fts5QueryObj.type === 'exact_course') {
        const courseMatches = executeWithPerformanceTracking(
          fts5Statements.coursesAutocompleteFTS5Fast, 
          [fts5Query], 
          'autocomplete-fts5-fast', 
          'fts5'
        );
        courses = getBatchCourseDetails(courseMatches);
        professors = [];
        departments = [];
      } else {
        // Standard path: Full FTS5 queries with JOINs
        const coursesResult = executeWithFallback(
          fts5Statements.coursesAutocompleteFTS5,
          courseStatements.coursesAutocomplete,
          [fts5Query, `%${search.replace(/ /g, "")}%`, `%${search.replace(/ /g, "")}%`],
          'autocomplete-courses'
        );
        courses = coursesResult.results;

        const professorsResult = executeWithFallback(
          fts5Statements.professorsAutocompleteFTS5,
          professorStatements.professorsAutocomplete,
          [fts5Query, `%${search.replace(/ /g, "")}%`],
          'autocomplete-professors'
        );
        professors = professorsResult.results;

        const departmentsResult = executeWithFallback(
          fts5Statements.departmentsAutocompleteFTS5,
          departmentStatements.departmentsAutocomplete,
          [fts5Query, `%${search.replace(/ /g, "")}%`, `%${search.replace(/ /g, "")}%`],
          'autocomplete-departments'
        );
        departments = departmentsResult.results;
      }
    } else {
      // Use LIKE fallback for edge cases
      const searchParam = `%${search.replace(/ /g, "")}%`;
      courses = executeWithPerformanceTracking(courseStatements.coursesAutocomplete, [searchParam, searchParam], 'autocomplete-courses-like');
      professors = executeWithPerformanceTracking(professorStatements.professorsAutocomplete, [searchParam], 'autocomplete-professors-like');
      departments = executeWithPerformanceTracking(departmentStatements.departmentsAutocomplete, [searchParam, searchParam], 'autocomplete-departments-like');
    }

    // Enhance courses with Oscar titles
    const enhancedCourses = enhanceCoursesWithTitles(courses);

    return {
      courses: enhancedCourses,
      professors: professors.map(parseJSONFromRow),
      departments: departments.map(parseJSONFromRow)
    };
  }, () => getAutocomplete(search), 'getAutocompleteFTS5');

  if (success) {
    autocompleteCache.set(cacheKey, result);
  }
  
  return result;
};

// Optimized autocomplete function with caching (fallback)
export const getAutocomplete = (search) => {
  const cacheKey = `autocomplete:${search}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached) return cached;

  const { result, success } = safeExecute(() => {
    const searchParam = `%${search.replace(/ /g, "")}%`;
    
    // Execute all queries using prepared statements with performance tracking
    const courses = executeWithPerformanceTracking(courseStatements.coursesAutocomplete, [searchParam, searchParam], 'autocomplete-courses-fallback');
    const professors = executeWithPerformanceTracking(professorStatements.professorsAutocomplete, [searchParam], 'autocomplete-professors-fallback');  
    const departments = executeWithPerformanceTracking(departmentStatements.departmentsAutocomplete, [searchParam, searchParam], 'autocomplete-departments-fallback');

    // Enhance courses with Oscar titles
    const enhancedCourses = enhanceCoursesWithTitles(courses);

    return {
      courses: enhancedCourses,
      professors: professors.map(parseJSONFromRow),
      departments: departments.map(parseJSONFromRow)
    };
  }, () => ({ courses: [], professors: [], departments: [] }), 'getAutocomplete');

  if (success) {
    autocompleteCache.set(cacheKey, result);
  }
    
  return result;
};