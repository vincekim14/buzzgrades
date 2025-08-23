import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
// get the database from the root of the repo
const dbPath = path.resolve(process.cwd(), "../data-app/ProcessedData.db");
const cumulativeJsonPath = path.resolve(
  process.cwd(),
  "../data-app/COURSE_INFO/cumulative.json"
);

// Initialize database with better-sqlite3 and optimizations
const db = new Database(dbPath, { 
  readonly: true,
  fileMustExist: true
});

// Apply read-only safe SQLite optimizations
try {
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB
} catch (error) {
  console.warn("Some pragma settings couldn't be applied:", error.message);
}

// Simple LRU cache implementation for optimized search
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return null;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

// Create caches for optimized search
const searchCache = new LRUCache(50);
const autocompleteCache = new LRUCache(100);

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

const tryJSONParse = (str, err) => {
  try {
    if (JSON.parse(str)) return JSON.parse(str);
    return err;
  } catch (e) {
    if (err) return err;
    return str;
  }
};

const parseJSONFromRow = (row) => {
  const newRow = { ...row };
  if (row.grades) newRow.grades = tryJSONParse(row.grades);
  if (row.total_grades) newRow.total_grades = tryJSONParse(row.total_grades);
  if (row.libEds !== undefined) newRow.libEds = tryJSONParse(row.libEds, []);
  return newRow;
};

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
  // grouped distributions is an array of arrays of distributions
  // each distribution has a grades property, which is an object with the letter grades as keys and the number of students as values
  // we want to sum up the number of students for each letter grade across all distributions

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

// Synchronous query function for better-sqlite3 (much faster)
const syncQuery = (query, params = {}) => {
  const stmt = db.prepare(query);
  return stmt.all(params);
};

// Prepared statements for optimized search
const statements = {
  // Autocomplete queries - fast and simple
  coursesAutocomplete: db.prepare(`
    SELECT DISTINCT dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, 
           class_desc, total_students
    FROM classdistribution
    WHERE (dept_abbr || course_num LIKE ? OR class_desc LIKE ?)
    ORDER BY total_students DESC
    LIMIT 5
  `),
  
  professorsAutocomplete: db.prepare(`
    SELECT DISTINCT p.id, p.name, p.RMP_score
    FROM professor p
    WHERE p.name LIKE ? AND
          EXISTS (SELECT 1 FROM distribution d, classdistribution c
                  WHERE d.professor_id = p.id AND d.class_id = c.id)
    ORDER BY p.RMP_score DESC NULLS LAST
    LIMIT 5
  `),
  
  departmentsAutocomplete: db.prepare(`
    SELECT DISTINCT dept_abbr, dept_name
    FROM departmentdistribution
    WHERE (dept_abbr LIKE ? OR dept_name LIKE ?)
    LIMIT 5
  `),

  // Full search queries - optimized LIKE queries
  coursesSearch: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, 
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE (dept_abbr || course_num LIKE ? OR REPLACE(class_desc, ' ', '') LIKE ?)
    ORDER BY total_students DESC
    LIMIT 10
  `),
  
  professorsSearch: db.prepare(`
    SELECT p.*, 
           json_group_array(CASE WHEN td.grades IS NOT NULL THEN td.grades END) as all_grades
    FROM professor p
    LEFT JOIN distribution d ON p.id = d.professor_id
    LEFT JOIN termdistribution td ON d.id = td.dist_id
    WHERE REPLACE(p.name, ' ', '') LIKE ? AND
          EXISTS (SELECT 1 FROM distribution d2, classdistribution c
                  WHERE d2.professor_id = p.id AND d2.class_id = c.id)
    GROUP BY p.id
    ORDER BY p.RMP_score DESC NULLS LAST
    LIMIT 10
  `),
  
  departmentsSearch: db.prepare(`
    SELECT dd.*, 
           json_group_array(CASE WHEN cd.total_grades IS NOT NULL THEN cd.total_grades END) as all_grades
    FROM departmentdistribution dd
    LEFT JOIN classdistribution cd ON dd.dept_abbr = cd.dept_abbr AND dd.campus = cd.campus
    WHERE (dd.dept_name LIKE ? OR dd.dept_abbr LIKE ?)
    GROUP BY dd.campus, dd.dept_abbr
    LIMIT 10
  `)
};

// FTS5 Prepared statements for high-performance search with fallback
const fts5Statements = {
  // FTS5 Autocomplete queries - Get scores first, then join for details
  coursesAutocompleteFTS5: db.prepare(`
    SELECT fts.course_code, fts.course_name, fts.class_desc, fts.oscar_title, fts.class_id,
           bm25(courses_fts) as relevance_score,
           c.dept_abbr, c.course_num, c.total_students,
           c.dept_abbr || ' ' || c.course_num AS class_name
    FROM courses_fts fts
    JOIN classdistribution c ON c.id = fts.class_id
    WHERE courses_fts MATCH ?
    ORDER BY bm25(courses_fts), c.total_students DESC
    LIMIT 5
  `),
  
  professorsAutocompleteFTS5: db.prepare(`
    SELECT fts.name, bm25(professors_fts) as relevance_score,
           p.id, p.RMP_score
    FROM professors_fts fts
    JOIN professor p ON fts.rowid = p.id
    WHERE professors_fts MATCH ? AND
          EXISTS (SELECT 1 FROM distribution d, classdistribution c
                  WHERE d.professor_id = p.id AND d.class_id = c.id)
    ORDER BY bm25(professors_fts), p.RMP_score DESC NULLS LAST
    LIMIT 5
  `),
  
  departmentsAutocompleteFTS5: db.prepare(`
    SELECT fts.dept_abbr, fts.dept_name, bm25(departments_fts) as relevance_score
    FROM departments_fts fts
    WHERE departments_fts MATCH ?
    ORDER BY bm25(departments_fts)
    LIMIT 5
  `),

  // FTS5 Full search queries - Get scores first, then join for details
  coursesSearchFTS5: db.prepare(`
    SELECT fts.course_code, fts.course_name, fts.class_desc, fts.oscar_title, fts.class_id,
           bm25(courses_fts) as relevance_score,
           c.id, c.dept_abbr, c.course_num, c.total_students, c.total_grades,
           c.dept_abbr || ' ' || c.course_num AS class_name
    FROM courses_fts fts
    JOIN classdistribution c ON c.id = fts.class_id
    WHERE courses_fts MATCH ?
    ORDER BY bm25(courses_fts), c.total_students DESC
    LIMIT 10
  `),
  
  professorsSearchFTS5: db.prepare(`
    SELECT fts.name, bm25(professors_fts) as relevance_score,
           p.id, p.RMP_score
    FROM professors_fts fts
    JOIN professor p ON fts.rowid = p.id
    WHERE professors_fts MATCH ? AND
          EXISTS (SELECT 1 FROM distribution d, classdistribution c
                  WHERE d.professor_id = p.id AND d.class_id = c.id)
    ORDER BY bm25(professors_fts), p.RMP_score DESC NULLS LAST
    LIMIT 10
  `),
  
  departmentsSearchFTS5: db.prepare(`
    SELECT fts.dept_abbr, fts.dept_name, bm25(departments_fts) as relevance_score
    FROM departments_fts fts
    WHERE departments_fts MATCH ?
    ORDER BY bm25(departments_fts)
    LIMIT 10
  `)
};

// Helper function to convert search query to FTS5 format with smart processing
const toFTS5Query = (search) => {
  if (!search || !search.trim()) return null;
  
  const trimmed = search.trim();
  
  // For very short queries, don't use FTS5 as LIKE is often faster
  if (trimmed.length < 2) return null;
  
  // Sanitize input - remove or escape FTS5 special characters that cause syntax errors
  const hasFTS5SpecialChars = /[!"#%&'*+\-/<=>@\[\\\]^`{|}~]/.test(trimmed);
  if (hasFTS5SpecialChars && !/^[A-Z]{2,4}\d*\*?$/i.test(trimmed)) {
    // Contains special characters but not a course code pattern with wildcard
    // Fall back to LIKE for complex special character queries
    return null;
  }
  
  // Enhanced course code detection with multiple patterns
  const courseCodeExact = trimmed.match(/^([A-Z]{2,4})\s*(\d{4}[A-Z]?)$/i);
  const courseCodePartial = trimmed.match(/^([A-Z]{2,4})\s*(\d{1,3})?$/i);
  
  if (courseCodeExact) {
    const dept = courseCodeExact[1].toUpperCase();
    const number = courseCodeExact[2];
    
    // Exact course code search - highest priority: "CS1301", "MATH 1501"
    return {
      query: `"${dept}${number}" OR "${dept} ${number}"`,
      type: 'exact_course',
      boost: true,
      priority: 1000
    };
  }
  
  if (courseCodePartial) {
    const dept = courseCodePartial[1].toUpperCase();
    const partialNumber = courseCodePartial[2];
    
    if (partialNumber) {
      // Partial course number: "CS13" -> matches "CS1301", "CS1331" 
      return {
        query: `${dept}${partialNumber}*`,
        type: 'partial_course',
        boost: true,
        priority: 800
      };
    } else {
      // Department prefix search: "CS" - very high priority
      return {
        query: `${dept}*`,
        type: 'dept_prefix', 
        boost: true,
        priority: 900
      };
    }
  }
  
  // For common 2-letter department codes, use prefix search
  if (trimmed.length === 2 && /^[A-Z]{2}$/i.test(trimmed)) {
    return {
      query: `${trimmed.toUpperCase()}*`,
      type: 'dept_prefix',
      boost: true,
      priority: 900
    };
  }
  
  // For multi-word searches, try phrase search first
  if (trimmed.includes(' ')) {
    const words = trimmed.split(/\s+/).filter(word => word.length > 2);
    if (words.length >= 2) {
      // Use phrase search for titles like "Computer Science"
      // Escape quotes in the search term
      const escapedTrimmed = trimmed.replace(/"/g, '""');
      return {
        query: `"${escapedTrimmed}"`,
        type: 'phrase',
        boost: false,
        priority: 400
      };
    }
  }
  
  // For single words, use prefix search if likely to be efficient and safe
  if (trimmed.length >= 3 && /^[a-zA-Z]+$/i.test(trimmed)) {
    return {
      query: `${trimmed}*`,
      type: 'prefix',
      boost: false,
      priority: 200
    };
  }
  
  return null;
};

// Helper function to check if FTS5 tables are available
const hasFTS5Tables = (() => {
  let fts5Available = null;
  
  return () => {
    if (fts5Available === null) {
      try {
        db.prepare("SELECT COUNT(*) FROM courses_fts LIMIT 1").get();
        fts5Available = true;
      } catch (error) {
        console.warn("FTS5 tables not available, falling back to LIKE queries");
        fts5Available = false;
      }
    }
    return fts5Available;
  };
})();

// Light fuzzy reranking for scarce results
const fuzzyRerank = (results, originalSearch, type = 'courses') => {
  if (!results || results.length >= 3) {
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

export const getDistribution = (classCode) => {
  const sql = `
      SELECT d.id      as distribution_id,
             students,
             term,
             grades,
             professor_id,
             name      as professor_name,
             RMP_score as professor_RMP_score
      FROM classdistribution
               LEFT JOIN distribution d on classdistribution.id = d.class_id
               LEFT JOIN termdistribution t on d.id = t.dist_id
               LEFT JOIN professor p on d.professor_id = p.id
      WHERE 
        classdistribution.dept_abbr || course_num = REPLACE(:class_name, ' ', '')`;

  const params = {
    class_name: classCode,
  };

  const rows = syncQuery(sql, params);

  return summarizeTerms(groupBy(rows.map(parseJSONFromRow), "professor_id"));
};

export const getClassInfo = (classCode) => {
  const sql = `
      SELECT *
      FROM classdistribution
               LEFT JOIN departmentdistribution d on classdistribution.dept_abbr = d.dept_abbr AND classdistribution.campus = d.campus
               LEFT JOIN (SELECT lat.right_id,
                                 json_group_array(json_object('name', l.name, 'id', lat.left_id)) as libEds
                          FROM libedAssociationTable lat
                                   LEFT JOIN libEd l ON lat.left_id = l.id
                          GROUP BY right_id) libEds on classdistribution.id = libEds.right_id
      WHERE 
      classdistribution.dept_abbr || course_num = REPLACE(:class_name, ' ', '')`;

  const params = {
    class_name: classCode,
  };

  const rows = syncQuery(sql, params);
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

  return parsedRows;
};

export const getEveryClassCode = () => {
  const sql = `
      SELECT dept_abbr, course_num, class_desc
      FROM classdistribution
      `;

  const rows = syncQuery(sql);
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

  return enhancedRows;
};

export const getEveryProfessorCode = () => {
  const sql = `
      SELECT id, name
      FROM professor`;

  const rows = syncQuery(sql);

  return rows.map(parseJSONFromRow);
};

export const getEveryDepartmentCode = () => {
  const sql = `
      SELECT dept_abbr, dept_name
      FROM departmentdistribution
      `;

  const rows = syncQuery(sql);

  return rows.map(parseJSONFromRow);
};

export const getDeptInfo = (deptCode) => {
  const sql = `
      SELECT *
      FROM departmentdistribution
      WHERE dept_abbr = :dept_code
      `;

  const params = {
    dept_code: deptCode.toUpperCase(),
  };

  const rows = syncQuery(sql, params);

  return rows.map(parseJSONFromRow);
};

export const getClassDistribtionsInDept = (deptCode) => {
  const sql = `
      SELECT *
      FROM departmentdistribution
        LEFT JOIN classdistribution on classdistribution.dept_abbr = departmentdistribution.dept_abbr AND
        classdistribution.campus = departmentdistribution.campus
      WHERE
        classdistribution.dept_abbr = :dept_code
      ORDER BY course_num ASC
  `;

  const params = {
    dept_code: deptCode.toUpperCase(),
  };

  const rows = syncQuery(sql, params);
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

  return enhancedRows;
};

export const getInstructorInfo = (instructorId) => {
  const sql = `
      SELECT *
      FROM professor
      WHERE id = :instructor_id`;

  const params = {
    instructor_id: instructorId,
  };

  const rows = syncQuery(sql, params);

  return rows.map(parseJSONFromRow);
};

export const getInstructorClasses = (instructorId) => {
  const sql = `
      SELECT *
      FROM professor
               LEFT JOIN distribution d on professor.id = d.professor_id
               LEFT JOIN termdistribution t on d.id = t.dist_id
               LEFT JOIN classdistribution c on d.class_id = c.id
      WHERE professor.id = :instructor_id

      `;

  const params = {
    instructor_id: instructorId,
  };

  const rows = syncQuery(sql, params);
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

  return summarizeTerms(groupBy(enhancedRows, "class_id"));
};


// Helper function to calculate aggregate statistics from grades
const calculateAggregateStats = (allGrades) => {
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

  const GPA_MAP = { A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0.0 };

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

// Helper to check if course title matches search
const titleMatchesSearchOptimized = (courseTitle, searchQuery) => {
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

// Enhanced course processing with Oscar titles and stats
const enhanceCoursesWithStats = (courses, originalSearch = '') => {
  return courses.map(parseJSONFromRow).map((classItem) => {
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
      const GPA_MAP = { A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0.0 };

      const impactingGrades = Object.entries(combinedGrades).filter(
        ([grade]) => Object.keys(GPA_MAP).includes(grade)
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

      stats = {
        averageGPA,
        mostStudents: mostCommonEntry[0],
        mostStudentsPercent: parseFloat(
          ((100 * mostCommonEntry[1]) / totalStudents).toFixed(1)
        ),
      };
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

// FTS5-optimized autocomplete function with fallback to LIKE queries
export const getAutocompleteFTS5 = (search) => {
  const cacheKey = `autocomplete-fts5:${search}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached) return cached;

  try {
    // Check if FTS5 is available
    if (!hasFTS5Tables()) {
      return getAutocomplete(search); // Fallback to original function
    }

    const fts5QueryObj = toFTS5Query(search);
    if (!fts5QueryObj) {
      return getAutocomplete(search); // Fallback for short queries
    }
    
    const fts5Query = fts5QueryObj.query;

    let courses = [];
    let professors = [];  
    let departments = [];

    try {
      // Try FTS5 queries first
      courses = fts5Statements.coursesAutocompleteFTS5.all(fts5Query);
      professors = fts5Statements.professorsAutocompleteFTS5.all(fts5Query);
      departments = fts5Statements.departmentsAutocompleteFTS5.all(fts5Query);
    } catch (fts5Error) {
      console.warn("FTS5 autocomplete query failed, falling back to LIKE:", fts5Error.message);
      // Fallback to LIKE queries
      const searchParam = `%${search.replace(/ /g, "")}%`;
      courses = statements.coursesAutocomplete.all(searchParam, searchParam);
      professors = statements.professorsAutocomplete.all(searchParam);
      departments = statements.departmentsAutocomplete.all(searchParam, searchParam);
    }

    // Enhance courses with Oscar titles
    const enhancedCourses = courses.map(course => {
      const classCode = `${course.dept_abbr}${course.course_num}`;
      const courseInfo = getCourseInfo(classCode);
      return {
        ...course,
        oscarTitle: courseInfo?.title || null,
        class_desc: courseInfo?.title || course.class_desc
      };
    });

    const result = {
      courses: enhancedCourses,
      professors: professors.map(parseJSONFromRow),
      departments: departments.map(parseJSONFromRow)
    };

    autocompleteCache.set(cacheKey, result);
    return result;
    
  } catch (error) {
    console.error("Error in getAutocompleteFTS5:", error);
    return getAutocomplete(search); // Ultimate fallback
  }
};

// FTS5-optimized full search function with fallback to LIKE queries
export const getSearchFTS5 = (search) => {
  const cacheKey = `search-fts5:${search}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  try {
    // Check if FTS5 is available
    if (!hasFTS5Tables()) {
      return getSearchOptimized(search); // Fallback to original function
    }

    const fts5QueryObj = toFTS5Query(search);
    if (!fts5QueryObj) {
      return getSearchOptimized(search); // Fallback for short queries
    }
    
    const fts5Query = fts5QueryObj.query;
    
    // FTS5-First Approach: Use FTS5 for all valid queries
    // Only fall back to LIKE for technical limitations, not performance assumptions
    // Based on benchmarks: FTS5 is 7-487x faster across all categories when actually used

    let courses = [];
    let professors = [];
    let departments = [];

    try {
      // Try FTS5 queries first
      courses = fts5Statements.coursesSearchFTS5.all(fts5Query);
      professors = fts5Statements.professorsSearchFTS5.all(fts5Query);
      departments = fts5Statements.departmentsSearchFTS5.all(fts5Query);
    } catch (fts5Error) {
      console.warn("FTS5 search query failed, falling back to LIKE:", fts5Error.message);
      // Fallback to LIKE queries
      const searchParam = `%${search.replace(/ /g, "")}%`;
      courses = statements.coursesSearch.all(searchParam, searchParam);
      professors = statements.professorsSearch.all(searchParam);
      departments = statements.departmentsSearch.all(searchParam, searchParam);
    }

    // Enhance courses with full statistics and Oscar titles
    let enhancedCourses = enhanceCoursesWithStats(courses, search);

    // Apply light fuzzy reranking if results are scarce
    enhancedCourses = fuzzyRerank(enhancedCourses, search, 'courses');

    // For FTS5, bm25() ordering is already applied in SQL, just slice results
    enhancedCourses = enhancedCourses.slice(0, 10);

    // Enhance professors with statistics and apply fuzzy reranking
    let enhancedProfessors = professors.map(parseJSONFromRow).map(profItem => {
      let allGrades = [];
      if (profItem.all_grades && Array.isArray(profItem.all_grades)) {
        allGrades = profItem.all_grades.filter(g => g !== null);
      } else if (profItem.all_grades && typeof profItem.all_grades === 'string') {
        try {
          const parsed = JSON.parse(profItem.all_grades);
          allGrades = Array.isArray(parsed) ? parsed.filter(g => g !== null) : [];
        } catch (e) {
          allGrades = [];
        }
      }
      
      const stats = calculateAggregateStats(allGrades);
      
      return {
        ...profItem,
        ...stats,
      };
    });

    // Apply fuzzy reranking for professors if results are scarce
    enhancedProfessors = fuzzyRerank(enhancedProfessors, search, 'professors');

    // Enhance departments with statistics and apply fuzzy reranking
    let enhancedDepartments = departments.map(parseJSONFromRow).map(deptItem => {
      let allGrades = [];
      if (deptItem.all_grades && Array.isArray(deptItem.all_grades)) {
        allGrades = deptItem.all_grades.filter(g => g !== null);
      } else if (deptItem.all_grades && typeof deptItem.all_grades === 'string') {
        try {
          const parsed = JSON.parse(deptItem.all_grades);
          allGrades = Array.isArray(parsed) ? parsed.filter(g => g !== null) : [];
        } catch (e) {
          allGrades = [];
        }
      }
      
      const stats = calculateAggregateStats(allGrades);
      
      return {
        ...deptItem,
        ...stats,
      };
    });

    // Apply fuzzy reranking for departments if results are scarce
    enhancedDepartments = fuzzyRerank(enhancedDepartments, search, 'departments');

    const result = {
      departments: enhancedDepartments,
      classes: enhancedCourses,
      professors: enhancedProfessors,
    };

    searchCache.set(cacheKey, result);
    return result;
    
  } catch (error) {
    console.error("Error in getSearchFTS5:", error);
    return getSearchOptimized(search); // Ultimate fallback
  }
};

// Optimized autocomplete function with caching
export const getAutocomplete = (search) => {
  const cacheKey = `autocomplete:${search}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached) return cached;

  try {
    const searchParam = `%${search.replace(/ /g, "")}%`;
    
    // Execute all queries using prepared statements
    const courses = statements.coursesAutocomplete.all(searchParam, searchParam);
    const professors = statements.professorsAutocomplete.all(searchParam);
    const departments = statements.departmentsAutocomplete.all(searchParam, searchParam);

    // Enhance courses with Oscar titles
    const enhancedCourses = courses.map(course => {
      const classCode = `${course.dept_abbr}${course.course_num}`;
      const courseInfo = getCourseInfo(classCode);
      return {
        ...course,
        oscarTitle: courseInfo?.title || null,
        class_desc: courseInfo?.title || course.class_desc
      };
    });

    const result = {
      courses: enhancedCourses,
      professors: professors.map(parseJSONFromRow),
      departments: departments.map(parseJSONFromRow)
    };

    autocompleteCache.set(cacheKey, result);
    return result;
    
  } catch (error) {
    console.error("Error in getAutocomplete:", error);
    return { courses: [], professors: [], departments: [] };
  }
};

// Optimized full search function with caching
export const getSearchOptimized = (search) => {
  const cacheKey = `search:${search}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  try {
    const searchParam = `%${search.replace(/ /g, "")}%`;
    
    // Execute all queries using prepared statements
    const courses = statements.coursesSearch.all(searchParam, searchParam);
    const professors = statements.professorsSearch.all(searchParam);
    const departments = statements.departmentsSearch.all(searchParam, searchParam);

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
      .slice(0, 10);

    // Enhance professors with statistics
    const enhancedProfessors = professors.map(parseJSONFromRow).map(profItem => {
      let allGrades = [];
      if (profItem.all_grades && Array.isArray(profItem.all_grades)) {
        allGrades = profItem.all_grades.filter(g => g !== null);
      } else if (profItem.all_grades && typeof profItem.all_grades === 'string') {
        try {
          const parsed = JSON.parse(profItem.all_grades);
          allGrades = Array.isArray(parsed) ? parsed.filter(g => g !== null) : [];
        } catch (e) {
          allGrades = [];
        }
      }
      
      const stats = calculateAggregateStats(allGrades);
      
      return {
        ...profItem,
        ...stats,
      };
    });

    // Enhance departments with statistics  
    const enhancedDepartments = departments.map(parseJSONFromRow).map(deptItem => {
      let allGrades = [];
      if (deptItem.all_grades && Array.isArray(deptItem.all_grades)) {
        allGrades = deptItem.all_grades.filter(g => g !== null);
      } else if (deptItem.all_grades && typeof deptItem.all_grades === 'string') {
        try {
          const parsed = JSON.parse(deptItem.all_grades);
          allGrades = Array.isArray(parsed) ? parsed.filter(g => g !== null) : [];
        } catch (e) {
          allGrades = [];
        }
      }
      
      const stats = calculateAggregateStats(allGrades);
      
      return {
        ...deptItem,
        ...stats,
      };
    });

    const result = {
      departments: enhancedDepartments,
      classes: enhancedCourses,
      professors: enhancedProfessors,
    };

    searchCache.set(cacheKey, result);
    return result;
    
  } catch (error) {
    console.error("Error in getSearchOptimized:", error);
    return {
      departments: [],
      classes: [],
      professors: [],
    };
  }
};
