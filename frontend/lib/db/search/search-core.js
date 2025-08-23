/**
 * Core Search Implementation  
 * Full search functionality with FTS5 and LIKE fallbacks
 */

import { searchCache } from '../cache.js';
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
import { 
  enhanceCoursesWithStats, 
  enhanceProfessorsWithStats, 
  enhanceDepartmentsWithStats 
} from '../enhancers/index.js';
import { SEARCH_LIMITS } from '../../constants.js';

// Light fuzzy reranking for scarce results (optimized)
const fuzzyRerank = (results, originalSearch, type = 'courses') => {
  if (!results || results.length >= SEARCH_LIMITS.FUZZY_RERANK_THRESHOLD) {
    return results; // Don't rerank if we have enough results
  }
  
  const search = originalSearch.toLowerCase().trim();
  
  // Simple Levenshtein distance calculation
  const levenshteinDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  };
  
  return results.map(item => {
    let fuzzyScore = 0;
    let searchableText = '';
    
    if (type === 'courses') {
      const courseCode = `${item.dept_abbr}${item.course_num}`.toLowerCase();
      const courseName = item.class_desc?.toLowerCase() || '';
      const oscarTitle = item.oscarTitle?.toLowerCase() || '';
      
      // Exact course code match gets highest boost
      if (courseCode === search || courseCode === search.replace(/\s/g, '')) {
        fuzzyScore += 1000;
      }
      
      // Department prefix match
      if (search.length <= 4 && courseCode.startsWith(search)) {
        fuzzyScore += 500;
      }
      
      // Fuzzy matching on course name and title
      searchableText = `${courseName} ${oscarTitle}`;
      const distance = levenshteinDistance(search, searchableText.substring(0, search.length));
      fuzzyScore += Math.max(0, 100 - distance * 10);
      
      // Enrollment boost (logarithmic to prevent dominance)
      fuzzyScore += Math.log(Math.max(item.total_students || 1, 1)) * 5;
      
    } else if (type === 'professors') {
      const name = item.name?.toLowerCase() || '';
      searchableText = name;
      
      // Name fuzzy matching
      const distance = levenshteinDistance(search, name);
      fuzzyScore += Math.max(0, 100 - distance * 5);
      
      // RMP score boost
      if (item.RMP_score) {
        fuzzyScore += item.RMP_score * 10;
      }
      
    } else if (type === 'departments') {
      const deptAbbr = item.dept_abbr?.toLowerCase() || '';
      const deptName = item.dept_name?.toLowerCase() || '';
      
      // Exact department abbreviation match
      if (deptAbbr === search) {
        fuzzyScore += 1000;
      }
      
      searchableText = `${deptAbbr} ${deptName}`;
      const distance = levenshteinDistance(search, searchableText);
      fuzzyScore += Math.max(0, 100 - distance * 3);
    }
    
    return {
      ...item,
      fuzzyScore,
      // Combine with existing relevance score if available
      combinedScore: (item.relevance_score || 0) + fuzzyScore
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore);
};

// FTS5-optimized full search function with improved error handling
export const getSearchFTS5 = (search) => {
  const cacheKey = `search-fts5:${search}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const { result, success } = safeExecute(() => {
    // Check if FTS5 is available
    if (!hasFTS5Tables()) {
      return getSearchOptimized(search);
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
          fts5Statements.coursesSearchFTS5Fast, 
          [fts5Query], 
          'search-fts5-fast', 
          'fts5'
        );
        courses = getBatchCourseDetails(courseMatches);
        professors = [];
        departments = [];
      } else {
        // Standard path: Full FTS5 queries with JOINs
        const coursesResult = executeWithFallback(
          fts5Statements.coursesSearchFTS5,
          courseStatements.coursesSearch,
          [fts5Query, `%${search.replace(/ /g, "")}%`, `%${search.replace(/ /g, "")}%`],
          'search-courses'
        );
        courses = coursesResult.results;

        const professorsResult = executeWithFallback(
          fts5Statements.professorsSearchFTS5,
          professorStatements.professorsSearch,
          [fts5Query, `%${search.replace(/ /g, "")}%`],
          'search-professors'
        );
        professors = professorsResult.results;

        const departmentsResult = executeWithFallback(
          fts5Statements.departmentsSearchFTS5,
          departmentStatements.departmentsSearch,
          [fts5Query, `%${search.replace(/ /g, "")}%`, `%${search.replace(/ /g, "")}%`],
          'search-departments'
        );
        departments = departmentsResult.results;
      }
    } else {
      // Use LIKE fallback for edge cases
      const searchParam = `%${search.replace(/ /g, "")}%`;
      courses = executeWithPerformanceTracking(courseStatements.coursesSearch, [searchParam, searchParam], 'search-courses-like');
      professors = executeWithPerformanceTracking(professorStatements.professorsSearch, [searchParam], 'search-professors-like');
      departments = executeWithPerformanceTracking(departmentStatements.departmentsSearch, [searchParam, searchParam], 'search-departments-like');
    }

    // Enhance courses with full statistics and Oscar titles
    let enhancedCourses = enhanceCoursesWithStats(courses, search);

    // Apply light fuzzy reranking if results are scarce
    enhancedCourses = fuzzyRerank(enhancedCourses, search, 'courses');

    // For FTS5, ordering is already applied in SQL, just slice results
    enhancedCourses = enhancedCourses.slice(0, SEARCH_LIMITS.FULL_SEARCH);

    // Enhance professors and departments with statistics
    let enhancedProfessors = enhanceProfessorsWithStats(professors);
    enhancedProfessors = fuzzyRerank(enhancedProfessors, search, 'professors');

    let enhancedDepartments = enhanceDepartmentsWithStats(departments);
    enhancedDepartments = fuzzyRerank(enhancedDepartments, search, 'departments');

    return {
      departments: enhancedDepartments,
      classes: enhancedCourses,
      professors: enhancedProfessors,
    };
  }, () => getSearchOptimized(search), 'getSearchFTS5');

  if (success) {
    searchCache.set(cacheKey, result);
  }
  
  return result;
};

// Optimized full search function with caching (fallback)  
export const getSearchOptimized = (search) => {
  const cacheKey = `search-optimized:${search}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const { result, success } = safeExecute(() => {
    const searchParam = `%${search.replace(/ /g, "")}%`;
    
    // Execute all queries using prepared statements with performance tracking
    const courses = executeWithPerformanceTracking(courseStatements.coursesSearch, [searchParam, searchParam], 'search-courses-fallback');
    const professors = executeWithPerformanceTracking(professorStatements.professorsSearch, [searchParam], 'search-professors-fallback');
    const departments = executeWithPerformanceTracking(departmentStatements.departmentsSearch, [searchParam, searchParam], 'search-departments-fallback');

    // Enhance courses with full statistics
    let enhancedCourses = enhanceCoursesWithStats(courses, search);

    // Sort courses by relevance and limit results
    enhancedCourses = enhancedCourses
      .sort((a, b) => {
        if (a.relevanceScore !== b.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        return b.total_students - a.total_students;
      })
      .slice(0, SEARCH_LIMITS.FULL_SEARCH);

    // Enhance professors and departments with statistics
    const enhancedProfessors = enhanceProfessorsWithStats(professors);
    const enhancedDepartments = enhanceDepartmentsWithStats(departments);

    return {
      departments: enhancedDepartments,
      classes: enhancedCourses,
      professors: enhancedProfessors,
    };
  }, () => ({ departments: [], classes: [], professors: [] }), 'getSearchOptimized');

  if (success) {
    searchCache.set(cacheKey, result);
  }
    
  return result;
};