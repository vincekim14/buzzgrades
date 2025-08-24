import { promisedQuery, tryJSONParse } from './connection.js';
import { calculateAggregateStats } from './utils.js';
import { getSearch } from './search.js';

// Comprehensive course code detection patterns
const COURSE_CODE_PATTERNS = [
  // Course codes: "CS1332", "CS 1332", "CHEM1211K", "CHEM 1211K" 
  // Department (2-4 letters) + course numbers (1-4 digits) + optional letter suffix
  /^([A-Z]{2,4})\s*([0-9]{1,4})([A-Z])?$/i,
  // Common departments: "MATH", "CHEM", "PHYS", etc. (but not instructor names like "mark")
  /^(MATH|CHEM|PHYS|BIOL|BIOS|BMED|ACCT|ARCH|ECON|ENGL|HIST|ISYE|PSYC|MUSI|ECE|CS|ME|AE|CEE|MSE|NRE|CHBE)$/i,
];

// Detect if search term looks like a course code
const detectCourseCode = (searchTerm) => {
  const trimmed = searchTerm.trim();
  for (const pattern of COURSE_CODE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      // Handle course codes with numbers vs pure department names
      if (match[2]) {
        // Has course number: "CS1332", "CHEM1211K"
        const courseNum = match[2] + (match[3] || '');
        return {
          isDeptCode: true,
          dept: match[1].toUpperCase(),
          courseNum: courseNum
        };
      } else {
        // Pure department: "MATH", "CHEM"
        return {
          isDeptCode: true,
          dept: match[1] || match[0].toUpperCase(),
          courseNum: ''
        };
      }
    }
  }
  return { isDeptCode: false };
};

// Deduplication utility removed - no longer needed with optimized FTS5!

// Simplified FTS5 search - single query approach for better performance
export const getSearchFTS5 = async (search, deptFilter = null) => {
  const searchTerm = search.trim();
  if (searchTerm.length < 1) {
    return { departments: [], classes: [], professors: [] };
  }

  try {
    const courseCodeInfo = detectCourseCode(searchTerm);
    // console.log(`🔍 SEARCH DEBUG: "${searchTerm}" -> isDeptCode: ${courseCodeInfo.isDeptCode}, dept: ${courseCodeInfo.dept}, courseNum: ${courseCodeInfo.courseNum}`);
    
    if (courseCodeInfo.isDeptCode) {
      // Course code search: Use direct SQL for precision and speed
      const { dept, courseNum } = courseCodeInfo;
      const effectiveDept = deptFilter ? deptFilter.toUpperCase() : dept;
      
      // Use FTS5 MATCH for better performance with new structure
      const hasLetterSuffix = courseNum && /[0-9]+[A-Z]$/i.test(courseNum);
      const isPureDeptSearch = !courseNum; // Empty courseNum = pure department search
      
      const whereClause = hasLetterSuffix 
        ? `courses_fts MATCH '"${effectiveDept + courseNum}"'`
        : isPureDeptSearch
          ? `courses_fts MATCH '${effectiveDept}*' AND cf.department = '${effectiveDept}'`
          : `courses_fts MATCH '${effectiveDept + courseNum}*'`;
      
      const classSQL = `
        SELECT DISTINCT
          cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department,
          c.dept_abbr, c.course_num, c.total_students, c.total_grades,
          1000 as relevance_score
        FROM courses_fts cf
        JOIN classdistribution c ON cf.class_id = c.id
        WHERE ${whereClause} ORDER BY cf.course_code ASC LIMIT 7
      `;
      // console.log(`🔍 DEPT/COURSE SEARCH SQL: ${classSQL}`);
      
      // Context-aware instructor search: specific course vs department search
      const isSpecificCourse = courseNum && courseNum.length >= 3; // "1331" vs "13" or ""
      const instructorWhereClause = isSpecificCourse 
        ? `c.dept_abbr = '${effectiveDept}' AND c.course_num = '${courseNum}' AND p.name IS NOT NULL AND p.name != ''`
        : `c.dept_abbr = '${effectiveDept}' AND p.name IS NOT NULL AND p.name != ''`;
      
      const instructorSQL = `
        SELECT DISTINCT
          p.id as instructor_id, p.name as instructor_name, p.RMP_score, 500 as relevance_score
        FROM professor p
        JOIN distribution d ON p.id = d.instructor_id
        JOIN classdistribution c ON d.class_id = c.id
        WHERE ${instructorWhereClause}
        LIMIT 7
      `;
      
      const deptSQL = `
        SELECT DISTINCT dept_name, dept_abbr, 800 as relevance_score
        FROM departments_fts WHERE departments_fts MATCH '${effectiveDept}*'
        LIMIT 7
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
      // console.log(`🔍 CONTENT SEARCH PATH for: "${searchTerm}"`);
      const words = searchTerm.split(/\s+/);
      const flexibleTerm = words.length === 1 
        ? `${words[0]}* OR "${words[0]}"` // Single word: prefix OR exact
        : words.map(word => `${word}*`).join(' OR '); // Multiple words: all as prefixes with OR
      // console.log(`🔍 FLEXIBLE TERM: ${flexibleTerm}`);
      
      const searchParams = deptFilter 
        ? { search_term: flexibleTerm, dept_abbr: deptFilter.toUpperCase() }
        : { search_term: flexibleTerm };
      
      const whereClause = deptFilter 
        ? 'WHERE courses_fts MATCH @search_term AND department = @dept_abbr'
        : 'WHERE courses_fts MATCH @search_term';
      
      const classSQL = `
        SELECT cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department,
               c.dept_abbr, c.course_num, c.total_students, c.total_grades,
               (ABS(bm25(courses_fts)) * 2.0) as relevance_score
        FROM courses_fts cf
        JOIN classdistribution c ON cf.class_id = c.id
        ${whereClause} ORDER BY relevance_score DESC LIMIT 7
      `;
      // console.log(`🔍 CONTENT SEARCH SQL: ${classSQL}`);
      
      const instructorSQL = `
        SELECT p.id as instructor_id, p.name as instructor_name, p.RMP_score, 
               (ABS(bm25(professors_fts)) * 10.0) as relevance_score
        FROM professors_fts pf
        JOIN professor p ON pf.rowid = p.id
        WHERE professors_fts MATCH @search_term
        ORDER BY relevance_score DESC LIMIT 7
      `;
      
      const deptSQL = `
        SELECT dept_name, dept_abbr, 
               (ABS(bm25(departments_fts)) * 5.0) as relevance_score
        FROM departments_fts
        WHERE departments_fts MATCH @search_term
        ORDER BY relevance_score DESC LIMIT 7
      `;
      
      // Execute in parallel
      const [classes, instructors, departments] = await Promise.all([
        promisedQuery(classSQL, searchParams),
        promisedQuery(instructorSQL, { search_term: searchParams.search_term }),
        promisedQuery(deptSQL, { search_term: searchParams.search_term })
      ]);
      
      // No deduplication needed - FTS5 tables are already unique!
      return await enhanceResults(classes, instructors, departments);
    }

  } catch (error) {
    console.error('FTS5 search error:', error);
    return getSearch(search);
  }
};

// Optimized batch result enhancement
const enhanceResults = async (classes, instructors, departments) => {
  // console.log(`🔍 RAW RESULTS - Classes: ${classes.length}, Instructors: ${instructors.length}, Depts: ${departments.length}`);
  // console.log(`🔍 FIRST 3 CLASSES:`, classes.slice(0, 3).map(c => ({ code: c.course_code, title: c.course_title })));
  
  const [enhancedClasses, enhancedInstructors, enhancedDepartments] = await Promise.all([
    enhanceClasses(classes),
    enhanceInstructors(instructors),
    enhanceDepartments(departments)
  ]);
  
  // console.log(`🔍 ENHANCED FIRST 3 CLASSES:`, enhancedClasses.slice(0, 3).map(c => ({ code: c.class_name, desc: c.class_desc })));
  
  return {
    departments: enhancedDepartments,
    classes: enhancedClasses,
    professors: enhancedInstructors
  };
};

const enhanceClasses = async (classes) => {
  if (classes.length === 0) return [];
  
  // NO additional database queries! All data already included from main query
  return classes.map(classItem => {
    let stats = { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };
    
    // Calculate stats from already-included grade data
    if (classItem.total_grades) {
      const grades = tryJSONParse(classItem.total_grades);
      stats = calculateAggregateStats([grades]);
    }
    
    return {
      id: classItem.class_id,
      dept_abbr: classItem.dept_abbr,
      course_num: classItem.course_num,
      class_name: classItem.course_code_space || `${classItem.dept_abbr} ${classItem.course_num}`,
      class_desc: classItem.course_title || `${classItem.dept_abbr} ${classItem.course_num}`,
      oscarTitle: classItem.course_title,
      total_students: classItem.total_students || 0,
      relevanceScore: classItem.relevance_score > 0 ? classItem.relevance_score : -classItem.relevance_score,
      ...stats
    };
  });
};

const enhanceInstructors = async (instructors) => {
  if (instructors.length === 0) return [];
  
  // SIMPLIFIED: Skip grade calculation for professors to improve performance
  // (Grade stats for professors require complex aggregation - skip for speed)
  return instructors.map(instructor => ({
    id: instructor.instructor_id,
    name: instructor.instructor_name,
    RMP_score: instructor.RMP_score || null,
    relevanceScore: instructor.relevance_score > 0 ? instructor.relevance_score : -instructor.relevance_score,
    // Skip grade stats for performance - focus on search speed
    averageGPA: 0,
    mostStudents: "",
    mostStudentsPercent: 0
  }));
};

const enhanceDepartments = async (departments) => {
  if (departments.length === 0) return [];
  
  // SIMPLIFIED: Return basic department info without complex aggregation for speed
  return departments.map(dept => ({
    dept_abbr: dept.dept_abbr,
    dept_name: dept.dept_name,
    campus: 'Atlanta', // Default campus for performance
    relevanceScore: dept.relevance_score > 0 ? dept.relevance_score : -dept.relevance_score,
    // Skip complex grade aggregation for performance
    averageGPA: 0,
    mostStudents: "",
    mostStudentsPercent: 0
  }));
};