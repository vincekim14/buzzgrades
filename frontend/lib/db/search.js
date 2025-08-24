import { promisedQuery, getCourseInfo, tryJSONParse } from './connection.js';
import { parseJSONFromRow, calculateAggregateStats } from './utils.js';

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

export const getSearch = async (search) => {
  const classDistSQL = `
      SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, class_desc, total_students, total_grades
      FROM classdistribution
      WHERE 
        (
          dept_abbr || course_num LIKE @search
          OR REPLACE(class_desc, ' ', '') LIKE @search
        )
      ORDER BY total_students DESC
      LIMIT 10`;

  const professorSQL = `
      SELECT p.*, 
        json_group_array(CASE WHEN td.grades IS NOT NULL THEN td.grades END) as all_grades
      FROM professor p
      LEFT JOIN distribution d ON p.id = d.instructor_id
      LEFT JOIN termdistribution td ON d.id = td.dist_id
      WHERE 
        REPLACE(p.name, ' ', '') LIKE @search AND
        EXISTS (
          SELECT 1
          FROM distribution d2, classdistribution c
          WHERE d2.instructor_id = p.id AND d2.class_id = c.id
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
        (dd.dept_name LIKE @search OR dd.dept_abbr LIKE @search)
      GROUP BY dd.campus, dd.dept_abbr
      LIMIT 10`;

  const params = {
    search: `%${search.replace(/ /g, "")}%`,
  };

  const departments = await promisedQuery(deptSQL, params);
  const classes = await promisedQuery(classDistSQL, params);
  const professors = await promisedQuery(professorSQL, params);

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
    .map(row => parseJSONFromRow(row, tryJSONParse))
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

      // Calculate stats using reusable function
      const stats = totalStudents > 0 
        ? calculateAggregateStats([combinedGrades])
        : { averageGPA: 0, mostStudents: "", mostStudentsPercent: 0 };

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
  const enhancedProfessors = professors.map(row => parseJSONFromRow(row, tryJSONParse)).map(profItem => {
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
  const enhancedDepartments = departments.map(row => parseJSONFromRow(row, tryJSONParse)).map(deptItem => {
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