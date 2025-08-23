/**
 * Course-Specific Database Statements
 * All prepared statements related to course queries
 */

import { db } from '../connection.js';
import { SEARCH_LIMITS } from '../../constants.js';

// Course autocomplete and search statements
export const courseStatements = {
  // Autocomplete queries - fast and simple
  coursesAutocomplete: db.prepare(`
    SELECT DISTINCT dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, 
           class_desc, total_students
    FROM classdistribution
    WHERE (dept_abbr || course_num LIKE ? OR class_desc LIKE ?)
    ORDER BY total_students DESC
    LIMIT ${SEARCH_LIMITS.AUTOCOMPLETE}
  `),

  // Full search queries - optimized LIKE queries
  coursesSearch: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, 
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE (dept_abbr || course_num LIKE ? OR REPLACE(class_desc, ' ', '') LIKE ?)
    ORDER BY total_students DESC
    LIMIT ${SEARCH_LIMITS.FULL_SEARCH}
  `),

  // Course distribution queries
  courseDistribution: db.prepare(`
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
      classdistribution.dept_abbr || course_num = REPLACE(:class_name, ' ', '')
  `),

  // Course info queries
  courseInfo: db.prepare(`
    SELECT *
    FROM classdistribution
             LEFT JOIN departmentdistribution d on classdistribution.dept_abbr = d.dept_abbr AND classdistribution.campus = d.campus
             LEFT JOIN (SELECT lat.right_id,
                               json_group_array(json_object('name', l.name, 'id', lat.left_id)) as libEds
                        FROM libedAssociationTable lat
                                 LEFT JOIN libEd l ON lat.left_id = l.id
                        GROUP BY right_id) libEds on classdistribution.id = libEds.right_id
    WHERE 
    classdistribution.dept_abbr || course_num = REPLACE(:class_name, ' ', '')
  `),

  // All courses query
  allCourses: db.prepare(`
    SELECT dept_abbr, course_num, class_desc
    FROM classdistribution
  `)
};