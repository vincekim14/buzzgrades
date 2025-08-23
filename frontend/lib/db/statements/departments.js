/**
 * Department-Specific Database Statements
 * All prepared statements related to department queries
 */

import { db } from '../connection.js';
import { SEARCH_LIMITS } from '../../constants.js';

// Department autocomplete and search statements
export const departmentStatements = {
  // Autocomplete queries
  departmentsAutocomplete: db.prepare(`
    SELECT DISTINCT dept_abbr, dept_name
    FROM departmentdistribution
    WHERE (dept_abbr LIKE ? OR dept_name LIKE ?)
    LIMIT ${SEARCH_LIMITS.AUTOCOMPLETE}
  `),

  // Full search queries  
  departmentsSearch: db.prepare(`
    SELECT dd.*, 
           json_group_array(CASE WHEN cd.total_grades IS NOT NULL THEN cd.total_grades END) as all_grades
    FROM departmentdistribution dd
    LEFT JOIN classdistribution cd ON dd.dept_abbr = cd.dept_abbr AND dd.campus = cd.campus
    WHERE (dd.dept_name LIKE ? OR dd.dept_abbr LIKE ?)
    GROUP BY dd.campus, dd.dept_abbr
    LIMIT ${SEARCH_LIMITS.FULL_SEARCH}
  `),

  // Department info query
  deptInfo: db.prepare(`
    SELECT *
    FROM departmentdistribution
    WHERE dept_abbr = :dept_code
  `),

  // Department classes query
  deptClasses: db.prepare(`
    SELECT *
    FROM departmentdistribution
      LEFT JOIN classdistribution on classdistribution.dept_abbr = departmentdistribution.dept_abbr AND
      classdistribution.campus = departmentdistribution.campus
    WHERE
      classdistribution.dept_abbr = :dept_code
    ORDER BY course_num ASC
  `),

  // All departments query
  allDepartments: db.prepare(`
    SELECT dept_abbr, dept_name
    FROM departmentdistribution
  `)
};