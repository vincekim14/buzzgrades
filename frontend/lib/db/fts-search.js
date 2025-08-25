import { promisedQuery } from './connection.js';
import { getSearch } from './search.js';

// Search result cache for performance
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Common department searches to cache aggressively
const COMMON_DEPT_SEARCHES = ['math', 'chem', 'cs', 'phys', 'biol', 'econ', 'me', 'ece', 'isye'];

const getCachedResult = (searchKey) => {
  const cached = searchCache.get(searchKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
};

const setCachedResult = (searchKey, data) => {
  searchCache.set(searchKey, {
    data,
    timestamp: Date.now()
  });
  
  // Limit cache size
  if (searchCache.size > 50) {
    const firstKey = searchCache.keys().next().value;
    searchCache.delete(firstKey);
  }
};

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
  const trimmed = searchTerm.trim().toUpperCase();
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

  // Check cache first for common searches
  const searchKey = `${searchTerm.toLowerCase()}:${deptFilter || 'all'}`;
  const cached = getCachedResult(searchKey);
  if (cached) {
    return cached;
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
      const isDeptOnlySearch = !courseNum; // Empty courseNum = pure department search
      
      const whereClause = hasLetterSuffix 
        ? 'courses_fts MATCH @exact_course_pattern'
        : isDeptOnlySearch
          ? 'courses_fts MATCH @dept_pattern AND cf.department = @dept_abbr'
          : 'courses_fts MATCH @course_pattern';
      
      const classSQL = `
        SELECT DISTINCT
          cf.class_id, cf.course_code, cf.course_code_space, cf.course_title, cf.department,
          1000 as relevance_score,
          cs.average_gpa AS averageGPA, cs.most_grade AS mostStudents, cs.most_percent AS mostStudentsPercent
        FROM courses_fts cf
        LEFT JOIN class_summary cs ON cs.class_id = cf.class_id
        WHERE ${whereClause} ORDER BY cf.course_code ASC LIMIT 7
      `;
      
      // Prepare parameters based on search type
      let classParams = {};
      if (hasLetterSuffix) {
        classParams.exact_course_pattern = `"${effectiveDept + courseNum}"`;
      } else if (isDeptOnlySearch) {
        classParams.dept_pattern = effectiveDept + '*';
        classParams.dept_abbr = effectiveDept;
      } else {
        classParams.course_pattern = effectiveDept + courseNum + '*';
      }
      // console.log(`🔍 DEPT/COURSE SEARCH SQL: ${classSQL}`);
      
      // Context-aware instructor search: specific course vs department search
      const isSpecificCourse = courseNum && courseNum.length >= 3; // "1331" vs "13" or ""
      const isPureDeptSearch = !courseNum; // Empty courseNum = pure department search
      
      let instructorSQL;
      let instructorParams;
      if (isPureDeptSearch) {
        // For pure department searches like "chem", limit to top instructors
        instructorSQL = `
          SELECT DISTINCT
            p.id as instructor_id, p.name as instructor_name, p.RMP_score, 400 as relevance_score,
            COUNT(DISTINCT c.id) as course_count,
            ins.average_gpa AS averageGPA, ins.most_grade AS mostStudents, ins.most_percent AS mostStudentsPercent
          FROM professor p
          JOIN distribution d ON p.id = d.instructor_id
          JOIN classdistribution c ON d.class_id = c.id
          LEFT JOIN instructor_summary ins ON ins.instructor_id = p.id
          WHERE c.dept_abbr = @dept_abbr AND p.name IS NOT NULL AND p.name != ''
          GROUP BY p.id
          ORDER BY course_count DESC, p.RMP_score DESC
          LIMIT 4
        `;
        instructorParams = { dept_abbr: effectiveDept };
      } else {
        // For specific courses, show all relevant instructors
        const instructorWhereClause = isSpecificCourse 
          ? "c.dept_abbr = @dept_abbr AND c.course_num = @course_num AND p.name IS NOT NULL AND p.name != ''"
          : "c.dept_abbr = @dept_abbr AND p.name IS NOT NULL AND p.name != ''";
        
        instructorSQL = `
          SELECT DISTINCT
            p.id as instructor_id, p.name as instructor_name, p.RMP_score, 500 as relevance_score,
            ins.average_gpa AS averageGPA, ins.most_grade AS mostStudents, ins.most_percent AS mostStudentsPercent
          FROM professor p
          JOIN distribution d ON p.id = d.instructor_id
          JOIN classdistribution c ON d.class_id = c.id
          LEFT JOIN instructor_summary ins ON ins.instructor_id = p.id
          WHERE ${instructorWhereClause}
          LIMIT 7
        `;
        
        instructorParams = { dept_abbr: effectiveDept };
        if (isSpecificCourse) {
          instructorParams.course_num = courseNum;
        }
      }
      
      const deptSQL = `
        SELECT DISTINCT df.dept_name, df.dept_abbr, 1200 as relevance_score,
               ds.average_gpa AS averageGPA, ds.most_grade AS mostStudents, ds.most_percent AS mostStudentsPercent
        FROM departments_fts df
        LEFT JOIN department_summary ds ON ds.dept_abbr = df.dept_abbr
        WHERE departments_fts MATCH @dept_pattern
        LIMIT 7
      `;
      const deptParams = { dept_pattern: effectiveDept + '*' };
      
      // Execute in parallel
      const [classes, instructors, departments] = await Promise.all([
        promisedQuery(classSQL, classParams),
        promisedQuery(instructorSQL, instructorParams), 
        promisedQuery(deptSQL, deptParams)
      ]);
      
      const result = await enhanceResults(classes, instructors, departments);
      
      // Cache department searches and other common queries
      if (COMMON_DEPT_SEARCHES.includes(searchTerm.toLowerCase()) || courseCodeInfo.isDeptCode) {
        setCachedResult(searchKey, result);
      }
      
      return result;
      
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
               (ABS(bm25(courses_fts)) * 2.0) as relevance_score,
               cs.average_gpa AS averageGPA, cs.most_grade AS mostStudents, cs.most_percent AS mostStudentsPercent
        FROM courses_fts cf
        LEFT JOIN class_summary cs ON cs.class_id = cf.class_id
        ${whereClause} ORDER BY relevance_score DESC LIMIT 7
      `;
      // console.log(`🔍 CONTENT SEARCH SQL: ${classSQL}`);
      
      const instructorSQL = `
        SELECT p.id as instructor_id, p.name as instructor_name, p.RMP_score, 
               (ABS(bm25(professors_fts)) * 10.0) as relevance_score,
               ins.average_gpa AS averageGPA, ins.most_grade AS mostStudents, ins.most_percent AS mostStudentsPercent
        FROM professors_fts pf
        JOIN professor p ON pf.rowid = p.id
        LEFT JOIN instructor_summary ins ON ins.instructor_id = p.id
        WHERE professors_fts MATCH @search_term
        ORDER BY relevance_score DESC LIMIT 7
      `;
      
      const deptSQL = `
        SELECT df.dept_name, df.dept_abbr, 
               (ABS(bm25(departments_fts)) * 5.0) as relevance_score,
               ds.average_gpa AS averageGPA, ds.most_grade AS mostStudents, ds.most_percent AS mostStudentsPercent
        FROM departments_fts df
        LEFT JOIN department_summary ds ON ds.dept_abbr = df.dept_abbr
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
      const result = await enhanceResults(classes, instructors, departments);
      
      // Cache content searches if they're common terms
      if (COMMON_DEPT_SEARCHES.some(term => searchTerm.toLowerCase().includes(term))) {
        setCachedResult(searchKey, result);
      }
      
      return result;
    }

  } catch (error) {
    console.error('FTS5 search error:', error);
    console.warn(`🚨 FALLBACK: FTS5 search failed for "${search}", using legacy search. Error:`, error.message);
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
  
  // OPTIMIZED: Build class info directly from courses_fts fields
  // Remove zero/null fields for smaller JSON payload
  return classes.map(classItem => {
    const result = {
      id: classItem.class_id,
      class_name: classItem.course_code_space || classItem.course_code,
      class_desc: classItem.course_title || classItem.course_code_space || classItem.course_code,
      relevanceScore: classItem.relevance_score > 0 ? classItem.relevance_score : -classItem.relevance_score
    };
    
    // Only include non-null values
    if (classItem.course_title) result.oscarTitle = classItem.course_title;
    
    // Add summary data if available
    if (classItem.averageGPA) result.averageGPA = classItem.averageGPA;
    if (classItem.mostStudents) result.mostStudents = classItem.mostStudents;
    if (classItem.mostStudentsPercent) result.mostStudentsPercent = classItem.mostStudentsPercent;
    
    return result;
  });
};

const enhanceInstructors = async (instructors) => {
  if (instructors.length === 0) return [];
  
  // SIMPLIFIED: Skip grade calculation for professors to improve performance
  // Remove zero/null fields for smaller JSON payload
  return instructors.map(instructor => {
    const result = {
      id: instructor.instructor_id,
      name: instructor.instructor_name,
      relevanceScore: instructor.relevance_score > 0 ? instructor.relevance_score : -instructor.relevance_score
    };
    
    // Only include non-null values
    if (instructor.RMP_score) result.RMP_score = instructor.RMP_score;
    
    // Add summary data if available
    if (instructor.averageGPA) result.averageGPA = instructor.averageGPA;
    if (instructor.mostStudents) result.mostStudents = instructor.mostStudents;
    if (instructor.mostStudentsPercent) result.mostStudentsPercent = instructor.mostStudentsPercent;
    
    return result;
  });
};

const enhanceDepartments = async (departments) => {
  if (departments.length === 0) return [];
  
  // Use precomputed summaries from LEFT JOIN - no more heavy aggregation!
  return departments.map(dept => {
    const result = {
      dept_abbr: dept.dept_abbr,
      dept_name: dept.dept_name,
      campus: 'Atlanta', // Default campus for performance
      relevanceScore: dept.relevance_score > 0 ? dept.relevance_score : -dept.relevance_score
    };
    
    // Add precomputed summary data if available
    if (dept.averageGPA) result.averageGPA = dept.averageGPA;
    if (dept.mostStudents) result.mostStudents = dept.mostStudents;
    if (dept.mostStudentsPercent) result.mostStudentsPercent = dept.mostStudentsPercent;
    
    return result;
  });
};