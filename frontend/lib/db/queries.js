import { promisedQuery, getCourseInfo, tryJSONParse } from './connection.js';
import { parseJSONFromRow, groupBy, summarizeTerms, calculateAggregateStats } from './utils.js';

export const getDistribution = async (classCode) => {
  const sql = `
      SELECT d.id      as distribution_id,
             students,
             term,
             grades,
             d.instructor_id as professor_id,
             name            as professor_name,
             RMP_score       as professor_RMP_score
      FROM classdistribution
               LEFT JOIN distribution d on classdistribution.id = d.class_id
               LEFT JOIN termdistribution t on d.id = t.dist_id
               LEFT JOIN professor p on d.instructor_id = p.id
      WHERE 
        classdistribution.dept_abbr || course_num = REPLACE(@class_name, ' ', '')`;

  const params = {
    class_name: classCode,
  };

  const rows = await promisedQuery(sql, params);

  return summarizeTerms(groupBy(rows.map(row => parseJSONFromRow(row, tryJSONParse)), "professor_id"));
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
      classdistribution.dept_abbr || course_num = REPLACE(@class_name, ' ', '')`;

  const params = {
    class_name: classCode,
  };

  const rows = await promisedQuery(sql, params);
  const parsedRows = rows.map(row => parseJSONFromRow(row, tryJSONParse));

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
  const parsedRows = rows.map(row => parseJSONFromRow(row, tryJSONParse));

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

  return rows.map(row => parseJSONFromRow(row, tryJSONParse));
};

export const getEveryDepartmentCode = async () => {
  const sql = `
      SELECT dept_abbr, dept_name
      FROM departmentdistribution
      `;

  const rows = await promisedQuery(sql);

  return rows.map(row => parseJSONFromRow(row, tryJSONParse));
};

export const getDeptInfo = async (deptCode) => {
  const sql = `
      SELECT *
      FROM departmentdistribution
      WHERE dept_abbr = @dept_code
      `;

  const params = {
    dept_code: deptCode.toUpperCase(),
  };

  const rows = await promisedQuery(sql, params);

  return rows.map(row => parseJSONFromRow(row, tryJSONParse));
};

export const getClassDistribtionsInDept = async (deptCode) => {
  const sql = `
      SELECT *
      FROM departmentdistribution
        LEFT JOIN classdistribution on classdistribution.dept_abbr = departmentdistribution.dept_abbr AND
        classdistribution.campus = departmentdistribution.campus
      WHERE
        classdistribution.dept_abbr = @dept_code
      ORDER BY course_num ASC
  `;

  const params = {
    dept_code: deptCode.toUpperCase(),
  };

  const rows = await promisedQuery(sql, params);
  const parsedRows = rows.map(row => parseJSONFromRow(row, tryJSONParse));

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
      WHERE id = @instructor_id`;

  const params = {
    instructor_id: instructorId,
  };

  const rows = await promisedQuery(sql, params);

  return rows.map(row => parseJSONFromRow(row, tryJSONParse));
};

export const getInstructorClasses = async (instructorId) => {
  const sql = `
      SELECT *
      FROM professor
               LEFT JOIN distribution d on professor.id = d.instructor_id
               LEFT JOIN termdistribution t on d.id = t.dist_id
               LEFT JOIN classdistribution c on d.class_id = c.id
      WHERE professor.id = @instructor_id

      `;

  const params = {
    instructor_id: instructorId,
  };

  const rows = await promisedQuery(sql, params);
  const parsedRows = rows.map(row => parseJSONFromRow(row, tryJSONParse));

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