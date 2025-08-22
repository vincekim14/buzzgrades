import sqlite3 from "sqlite3";
const { Database, OPEN_READONLY } = sqlite3;
import path from "path";
import fs from "fs";
// get the database from the root of the repo
const dbPath = path.resolve(process.cwd(), "../data-app/ProcessedData.db");
const cumulativeJsonPath = path.resolve(
  process.cwd(),
  "../data-app/COURSE_INFO/cumulative.json"
);

const db = new Database(dbPath, OPEN_READONLY);

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

const promisedQuery = (query, params) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

export const getDistribution = async (classCode) => {
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
        classdistribution.dept_abbr || course_num = REPLACE($class_name, ' ', '')`;

  const params = {
    $class_name: classCode,
  };

  const rows = await promisedQuery(sql, params);

  return summarizeTerms(groupBy(rows.map(parseJSONFromRow), "professor_id"));
};

export const getClassInfo = async (classCode) => {
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
      classdistribution.dept_abbr || course_num = REPLACE($class_name, ' ', '')`;

  const params = {
    $class_name: classCode,
  };

  const rows = await promisedQuery(sql, params);
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

export const getEveryClassCode = async () => {
  const sql = `
      SELECT dept_abbr, course_num, class_desc
      FROM classdistribution
      `;

  const rows = await promisedQuery(sql);
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

export const getEveryProfessorCode = async () => {
  const sql = `
      SELECT id, name
      FROM professor`;

  const rows = await promisedQuery(sql);

  return rows.map(parseJSONFromRow);
};

export const getEveryDepartmentCode = async () => {
  const sql = `
      SELECT dept_abbr, dept_name
      FROM departmentdistribution
      `;

  const rows = await promisedQuery(sql);

  return rows.map(parseJSONFromRow);
};

export const getDeptInfo = async (deptCode) => {
  const sql = `
      SELECT *
      FROM departmentdistribution
      WHERE dept_abbr = $dept_code
      `;

  const params = {
    $dept_code: deptCode.toUpperCase(),
  };

  const rows = await promisedQuery(sql, params);

  return rows.map(parseJSONFromRow);
};

export const getClassDistribtionsInDept = async (deptCode) => {
  const sql = `
      SELECT *
      FROM departmentdistribution
        LEFT JOIN classdistribution on classdistribution.dept_abbr = departmentdistribution.dept_abbr AND
        classdistribution.campus = departmentdistribution.campus
      WHERE
        classdistribution.dept_abbr = $dept_code
      ORDER BY course_num ASC
  `;

  const params = {
    $dept_code: deptCode.toUpperCase(),
  };

  const rows = await promisedQuery(sql, params);
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

export const getInstructorInfo = async (instructorId) => {
  const sql = `
      SELECT *
      FROM professor
      WHERE id = $instructor_id`;

  const params = {
    $instructor_id: instructorId,
  };

  const rows = await promisedQuery(sql, params);

  return rows.map(parseJSONFromRow);
};

export const getInstructorClasses = async (instructorId) => {
  const sql = `
      SELECT *
      FROM professor
               LEFT JOIN distribution d on professor.id = d.professor_id
               LEFT JOIN termdistribution t on d.id = t.dist_id
               LEFT JOIN classdistribution c on d.class_id = c.id
      WHERE professor.id = $instructor_id

      `;

  const params = {
    $instructor_id: instructorId,
  };

  const rows = await promisedQuery(sql, params);
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

export const getSearch = async (search) => {
  const classDistSQL = `
      SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, class_desc, total_students, total_grades
      FROM classdistribution
      WHERE 
        (
          dept_abbr || course_num LIKE $search
          OR REPLACE(class_desc, ' ', '') LIKE $search
        )
      ORDER BY total_students DESC
      LIMIT 10`;

  const professorSQL = `
      SELECT p.*, 
        json_group_array(CASE WHEN td.grades IS NOT NULL THEN td.grades END) as all_grades
      FROM professor p
      LEFT JOIN distribution d ON p.id = d.professor_id
      LEFT JOIN termdistribution td ON d.id = td.dist_id
      WHERE 
        REPLACE(p.name, ' ', '') LIKE $search AND
        EXISTS (
          SELECT 1
          FROM distribution d2, classdistribution c
          WHERE d2.professor_id = p.id AND d2.class_id = c.id
        )
      GROUP BY p.id
      ORDER BY p.RMP_score DESC
      LIMIT 10`;

  const deptSQL = `
      SELECT dd.*, 
        json_group_array(CASE WHEN cd.total_grades IS NOT NULL THEN cd.total_grades END) as all_grades
      FROM departmentdistribution dd
      LEFT JOIN classdistribution cd ON dd.dept_abbr = cd.dept_abbr AND dd.campus = cd.campus
      WHERE 
        (dd.dept_name LIKE $search OR dd.dept_abbr LIKE $search)
      GROUP BY dd.campus, dd.dept_abbr
      LIMIT 10`;

  const params = {
    $search: `%${search.replace(/ /g, "")}%`,
  };

  // Helper function to calculate aggregate statistics from grades
  const calculateAggregateStats = (allGrades) => {
    if (!allGrades || !Array.isArray(allGrades)) {
      return { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };
    }

    const combinedGrades = {};
    let totalStudents = 0;

    // Process each grade distribution
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

    // GPA mapping for GT letter grades (no plus/minus at GT)
    const GPA_MAP = {
      A: 4.0,
      B: 3.0,
      C: 2.0,
      D: 1.0,
      F: 0.0,
    };

    // Calculate average GPA
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

    // Find most common grade
    const mostCommonEntry = Object.entries(combinedGrades).reduce(
      (acc, [grade, count]) => (count > acc[1] ? [grade, count] : acc),
      ["", 0]
    );

    const mostStudents = mostCommonEntry[0];
    const mostStudentsPercent = parseFloat(
      ((100 * mostCommonEntry[1]) / totalStudents).toFixed(1)
    );

    return {
      averageGPA,
      mostStudents,
      mostStudentsPercent,
    };
  };

  const departments = await promisedQuery(deptSQL, params);
  const classes = await promisedQuery(classDistSQL, params);
  const professors = await promisedQuery(professorSQL, params);

  // Helper function to check if course title matches search query
  const titleMatchesSearch = (courseTitle, searchQuery) => {
    if (!courseTitle || !searchQuery) return false;

    const title = courseTitle.toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    // Direct substring match
    if (title.includes(query)) return true;

    // Word-by-word matching for multi-word searches
    if (query.includes(" ")) {
      const queryWords = query.split(/\s+/).filter((word) => word.length > 2);
      const matchedWords = queryWords.filter((word) => title.includes(word));
      return matchedWords.length >= Math.min(2, queryWords.length);
    }

    return false;
  };

  // Get additional classes that match by course title (but weren't caught by the DB query)
  const additionalMatches = [];
  if (search.trim().length > 2 && !/^\s*[A-Z]{2,4}\s*\d/.test(search)) {
    // Only search by title if it's not a course code pattern
    try {
      const allClassesSQL = `
        SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, class_desc, total_students, total_grades
        FROM classdistribution
        WHERE total_students > 0
        ORDER BY total_students DESC
        LIMIT 100`;

      const allClasses = await promisedQuery(allClassesSQL, {});

      allClasses.forEach((classItem) => {
        const classCode = `${classItem.dept_abbr}${classItem.course_num}`;
        const courseInfo = getCourseInfo(classCode);

        if (courseInfo?.title && titleMatchesSearch(courseInfo.title, search)) {
          // Check if this class isn't already in our results
          const alreadyIncluded = classes.some(
            (existing) =>
              existing.dept_abbr === classItem.dept_abbr &&
              existing.course_num === classItem.course_num
          );

          if (!alreadyIncluded) {
            additionalMatches.push(classItem);
          }
        }
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("Error searching by course title:", error);
      }
    }
  }

  // Combine original results with additional title matches
  const allMatches = [...classes, ...additionalMatches.slice(0, 5)]; // Limit additional matches

  // Enhance classes with Oscar titles and statistics
  const enhancedClasses = allMatches
    .map(parseJSONFromRow)
    .map((classItem) => {
      const classCode = `${classItem.dept_abbr}${classItem.course_num}`;
      const courseInfo = getCourseInfo(classCode);

      // Calculate stats from total_grades
      // For classes, total_grades is a single object with all grades, not an array
      const combinedGrades = classItem.total_grades || {};
      let totalStudents = 0;
      Object.values(combinedGrades).forEach((count) => {
        if (typeof count === "number") {
          totalStudents += count;
        }
      });

      let stats = { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };
      if (totalStudents > 0) {
        // GPA mapping for GT letter grades (no plus/minus at GT)
        const GPA_MAP = {
          A: 4.0,
          B: 3.0,
          C: 2.0,
          D: 1.0,
          F: 0.0,
        };

        // Calculate average GPA
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

        // Find most common grade
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

      // Calculate relevance score for sorting
      const courseTitle = courseInfo?.title || classItem.class_desc;

      // Base score: logarithmic scale for student count (prevents high-enrollment dominance)
      // This gives diminishing returns for very large classes while still preferring popular ones
      let relevanceScore =
        Math.log(Math.max(classItem.total_students, 1)) * 100;

      // Boost score if title matches search
      if (titleMatchesSearch(courseTitle, search)) {
        relevanceScore += 10000; // High boost for title matches
      }

      // Boost score if course code matches search (already in original results)
      const searchUpper = search.replace(/\s/g, "").toUpperCase();
      const courseCode = `${classItem.dept_abbr}${classItem.course_num}`;
      if (courseCode.includes(searchUpper)) {
        relevanceScore += 20000; // Even higher boost for code matches
      }

      return {
        ...classItem,
        oscarTitle: courseInfo?.title || null,
        // Update class_desc to show the actual title instead of just the course code
        class_desc: courseTitle,
        // Add calculated statistics
        ...stats,
        // Add relevance score for sorting
        relevanceScore,
      };
    })

    // Sort by relevance score, then by enrollment
    .sort((a, b) => {
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return b.total_students - a.total_students;
    })
  .slice(0, 10); // Limit to top 10 results

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
      // Add calculated statistics
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
      // Add calculated statistics
      ...stats,
    };
  });

  return {
    departments: enhancedDepartments,
    classes: enhancedClasses,
    professors: enhancedProfessors,
  };
};
