import { promisedQuery, tryJSONParse } from './connection.js';
import { calculateAggregateStats } from './utils.js';
import { getSearch } from './search.js';

// Smart course code detection patterns (including letter suffixes and partial numbers)
const COURSE_CODE_PATTERNS = [
  // "CHEM1211K", "ECE2020L", "CS6510P" - dept abbr + course number + letter suffix
  /^([A-Z]{2,6})\s*([0-9]{3,4}[A-Z])$/i,
  // "CS 133" or "CS133" - dept abbr + course number (no letter suffixes)
  /^([A-Z]{2,6})\s*([0-9]{3,4})$/i,
  // "CHEM 12", "CS13" - dept abbr + partial course number (2+ digits)
  /^([A-Z]{2,6})\s*([0-9]{2,3})$/i,
  // "CHEM 1", "CS1" - dept abbr + partial course number (1 digits)
  /^([A-Z]{2,6})\s*([0-9]{1,2})$/i,
  // "CHEM", "CS" - dept abbr + partial course number (0 digits)
  /^([A-Z]{2,6})\s*([0-9]{0,1})$/i,
  /^([A-Z]{2,6})$/i,
];

// Detect if search term looks like a course code
const detectCourseCode = (searchTerm) => {
  const trimmed = searchTerm.trim();
  for (const pattern of COURSE_CODE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        isDeptCode: true,
        dept: match[1].toUpperCase(),
        courseNum: match[2]
      };
    }
  }
  return { isDeptCode: false };
};

// Shared deduplication utility
const deduplicateResults = (results, keyField) => {
  const seen = new Set();
  return results.filter(item => {
    const key = item[keyField];
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

// Simplified FTS5 search - single query approach for better performance
export const getSearchFTS5 = async (search, deptFilter = null) => {
  const searchTerm = search.trim();
  if (searchTerm.length < 1) {
    return { departments: [], classes: [], professors: [] };
  }

  try {
    const courseCodeInfo = detectCourseCode(searchTerm);
    
    if (courseCodeInfo.isDeptCode) {
      // Course code search: Use direct SQL for precision and speed
      const { dept, courseNum } = courseCodeInfo;
      const effectiveDept = deptFilter ? deptFilter.toUpperCase() : dept;
      
      // Use exact match for letter suffixes (CHEM1211K), LIKE for numbers only (CS133 -> CS1331, CS1332)
      const hasLetterSuffix = /[0-9]+[KLP]$/i.test(courseNum);
      const whereClause = hasLetterSuffix 
        ? `dept_abbr = '${effectiveDept}' AND course_num = '${courseNum}'`
        : `dept_abbr = '${effectiveDept}' AND course_num LIKE '${courseNum}%'`;
      
      const classSQL = `
        SELECT DISTINCT
          class_id, dept_name, dept_abbr, course_num, course_title, course_description, total_students,
          1000 as relevance_score
        FROM courses_fts WHERE ${whereClause} ORDER BY course_num ASC LIMIT 30
      `;
      
      const instructorSQL = `
        SELECT DISTINCT
          p.id as instructor_id, p.name as instructor_name, 500 as relevance_score
        FROM professor p
        JOIN distribution d ON p.id = d.instructor_id
        JOIN classdistribution c ON d.class_id = c.id
        WHERE c.dept_abbr = '${effectiveDept}' AND p.name IS NOT NULL AND p.name != ''
        LIMIT 15
      `;
      
      const deptSQL = `
        SELECT DISTINCT dept_name, dept_abbr, 800 as relevance_score
        FROM departments_fts WHERE departments_fts MATCH '${effectiveDept}*'
        LIMIT 1
      `;
      
      // Execute in parallel
      const [classes, instructors, departments] = await Promise.all([
        promisedQuery(classSQL),
        promisedQuery(instructorSQL), 
        promisedQuery(deptSQL)
      ]);
      
      return await enhanceResults(classes, instructors, departments);
      
    } else {
      // Content search: Use FTS5 for relevance with flexible patterns
      const words = searchTerm.split(/\s+/);
      const flexibleTerm = words.length === 1 
        ? `${words[0]}* OR "${words[0]}"` // Single word: prefix OR exact
        : words.map(word => `${word}*`).join(' OR '); // Multiple words: all as prefixes with OR
      
      const searchParams = deptFilter 
        ? { search_term: flexibleTerm, dept_abbr: deptFilter.toUpperCase() }
        : { search_term: flexibleTerm };
      
      const whereClause = deptFilter 
        ? 'WHERE courses_fts MATCH @search_term AND dept_abbr = @dept_abbr'
        : 'WHERE courses_fts MATCH @search_term';
      
      const classSQL = `
        SELECT class_id, dept_name, dept_abbr, course_num, course_title, course_description, total_students,
               bm25(courses_fts) as relevance_score
        FROM courses_fts ${whereClause} ORDER BY bm25(courses_fts) ASC LIMIT 30
      `;
      
      const instructorSQL = `
        SELECT p.id as instructor_id, p.name as instructor_name, p.RMP_score, bm25(professors_fts) as relevance_score
        FROM professors_fts pf
        JOIN professor p ON pf.rowid = p.id
        WHERE professors_fts MATCH @search_term
        ORDER BY bm25(professors_fts) ASC LIMIT 15
      `;
      
      const deptSQL = `
        SELECT dept_name, dept_abbr, bm25(departments_fts) as relevance_score
        FROM departments_fts
        WHERE departments_fts MATCH @search_term
        ORDER BY bm25(departments_fts) ASC LIMIT 12
      `;
      
      // Execute in parallel
      const [classes, instructors, departments] = await Promise.all([
        promisedQuery(classSQL, searchParams),
        promisedQuery(instructorSQL, { search_term: searchParams.search_term }),
        promisedQuery(deptSQL, { search_term: searchParams.search_term })
      ]);
      
      // Deduplicate FTS5 results
      const ftsClasses = deduplicateResults(classes, 'class_id');
      const ftsInstructors = deduplicateResults(instructors, 'instructor_id');
      const ftsDepartments = deduplicateResults(departments, 'dept_abbr');
      
      return await enhanceResults(ftsClasses, ftsInstructors, ftsDepartments);
    }

  } catch (error) {
    console.error('FTS5 search error:', error);
    return getSearch(search);
  }
};

// Optimized batch result enhancement
const enhanceResults = async (classes, instructors, departments) => {
  const [enhancedClasses, enhancedInstructors, enhancedDepartments] = await Promise.all([
    enhanceClasses(classes),
    enhanceInstructors(instructors),
    enhanceDepartments(departments)
  ]);
  
  return {
    departments: enhancedDepartments,
    classes: enhancedClasses,
    professors: enhancedInstructors
  };
};

const enhanceClasses = async (classes) => {
  if (classes.length === 0) return [];
  
  // Batch query for all class grades
  const classIds = classes.map(c => c.class_id);
  const placeholders = classIds.map(() => '?').join(',');
  
  const gradeSQL = `SELECT id as class_id, total_grades FROM classdistribution WHERE id IN (${placeholders})`;
  const gradeData = await promisedQuery(gradeSQL, classIds);
  const gradeMap = new Map();
  gradeData.forEach(g => gradeMap.set(g.class_id, g));
  
  return classes.map(classItem => {
    const gradeInfo = gradeMap.get(classItem.class_id);
    let stats = { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };
    
    if (gradeInfo && gradeInfo.total_grades) {
      const grades = tryJSONParse(gradeInfo.total_grades);
      stats = calculateAggregateStats([grades]);
    }
    
    return {
      id: classItem.class_id,
      dept_abbr: classItem.dept_abbr,
      course_num: classItem.course_num,
      class_name: `${classItem.dept_abbr} ${classItem.course_num}`,
      class_desc: classItem.course_title || `${classItem.dept_abbr} ${classItem.course_num}`,
      oscarTitle: classItem.course_title,
      total_students: classItem.total_students,
      relevanceScore: classItem.relevance_score > 0 ? classItem.relevance_score : -classItem.relevance_score,
      ...stats
    };
  });
};

const enhanceInstructors = async (instructors) => {
  if (instructors.length === 0) return [];
  
  const instructorIds = instructors.map(i => i.instructor_id);
  const placeholders = instructorIds.map(() => '?').join(',');
  
  // Batch query for grades (professor data already included from FTS5 query)
  const grades = await promisedQuery(`
    SELECT d.instructor_id, td.grades 
    FROM distribution d JOIN termdistribution td ON d.id = td.dist_id 
    WHERE d.instructor_id IN (${placeholders})
  `, instructorIds);
  
  const gradesByInstructor = new Map();
  grades.forEach(g => {
    if (!gradesByInstructor.has(g.instructor_id)) gradesByInstructor.set(g.instructor_id, []);
    const parsed = tryJSONParse(g.grades);
    if (parsed) gradesByInstructor.get(g.instructor_id).push(parsed);
  });
  
  return instructors.map(instructor => {
    const instructorGrades = gradesByInstructor.get(instructor.instructor_id) || [];
    const stats = calculateAggregateStats(instructorGrades);
    
    return {
      id: instructor.instructor_id,
      name: instructor.instructor_name,
      RMP_score: instructor.RMP_score || null,
      relevanceScore: instructor.relevance_score > 0 ? instructor.relevance_score : -instructor.relevance_score,
      ...stats
    };
  });
};

const enhanceDepartments = async (departments) => {
  if (departments.length === 0) return [];
  
  const deptAbbrs = departments.map(d => d.dept_abbr);
  const placeholders = deptAbbrs.map(() => '?').join(',');
  
  // Batch queries
  const [campusData, grades] = await Promise.all([
    promisedQuery(`SELECT DISTINCT dept_abbr, campus FROM departmentdistribution WHERE dept_abbr IN (${placeholders})`, deptAbbrs),
    promisedQuery(`SELECT dept_abbr, total_grades FROM classdistribution WHERE dept_abbr IN (${placeholders}) AND total_grades IS NOT NULL`, deptAbbrs)
  ]);
  
  const campusMap = new Map();
  campusData.forEach(c => campusMap.set(c.dept_abbr, c.campus));
  
  const gradesByDept = new Map();
  grades.forEach(g => {
    if (!gradesByDept.has(g.dept_abbr)) gradesByDept.set(g.dept_abbr, []);
    const parsed = tryJSONParse(g.total_grades);
    if (parsed) gradesByDept.get(g.dept_abbr).push(parsed);
  });
  
  return departments.map(dept => {
    const deptGrades = gradesByDept.get(dept.dept_abbr) || [];
    const stats = calculateAggregateStats(deptGrades);
    
    return {
      dept_abbr: dept.dept_abbr,
      dept_name: dept.dept_name,
      campus: campusMap.get(dept.dept_abbr) || 'Atlanta',
      total_students: dept.total_students,
      relevanceScore: dept.relevance_score > 0 ? dept.relevance_score : -dept.relevance_score,
      ...stats
    };
  });
};