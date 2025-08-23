/**
 * Professor-Specific Database Statements
 * All prepared statements related to professor queries
 */

import { db } from '../connection.js';
import { SEARCH_LIMITS } from '../../constants.js';

// Professor autocomplete and search statements
export const professorStatements = {
  // Autocomplete queries
  professorsAutocomplete: db.prepare(`
    SELECT DISTINCT p.id, p.name, p.RMP_score
    FROM professor p
    WHERE p.name LIKE ? AND
          EXISTS (SELECT 1 FROM distribution d, classdistribution c
                  WHERE d.professor_id = p.id AND d.class_id = c.id)
    ORDER BY p.RMP_score DESC NULLS LAST
    LIMIT ${SEARCH_LIMITS.AUTOCOMPLETE}
  `),

  // Full search queries
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
    LIMIT ${SEARCH_LIMITS.FULL_SEARCH}
  `),

  // Professor info queries
  instructorInfo: db.prepare(`
    SELECT *
    FROM professor
    WHERE id = :instructor_id
  `),

  // Professor classes query
  instructorClasses: db.prepare(`
    SELECT *
    FROM professor
             LEFT JOIN distribution d on professor.id = d.professor_id
             LEFT JOIN termdistribution t on d.id = t.dist_id
             LEFT JOIN classdistribution c on d.class_id = c.id
    WHERE professor.id = :instructor_id
  `),

  // All professors query
  allProfessors: db.prepare(`
    SELECT id, name
    FROM professor
  `)
};