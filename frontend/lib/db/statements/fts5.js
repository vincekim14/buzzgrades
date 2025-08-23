/**
 * FTS5-Specific Database Statements
 * All prepared statements related to FTS5 full-text search
 */

import { db } from '../connection.js';
import { SEARCH_LIMITS, SCORING_WEIGHTS } from '../../constants.js';

// FTS5 Prepared statements for high-performance search with fallback
export const fts5Statements = {
  // FTS5 Autocomplete queries with weighted scoring
  coursesAutocompleteFTS5: db.prepare(`
    SELECT fts.course_code_compact, fts.course_code_spaced, fts.course_name, fts.class_desc, fts.oscar_title, fts.rowid as class_id,
           bm25(courses_fts) as relevance_score,
           c.dept_abbr, c.course_num, c.total_students,
           c.dept_abbr || ' ' || c.course_num AS class_name,
           (bm25(courses_fts) * ${SCORING_WEIGHTS.RELEVANCE} + LOG(COALESCE(NULLIF(c.total_students, 0), 1)) * ${SCORING_WEIGHTS.POPULARITY}) as weighted_score
    FROM courses_fts fts
    JOIN classdistribution c ON c.id = fts.rowid
    WHERE courses_fts MATCH ?
    ORDER BY weighted_score DESC
    LIMIT ${SEARCH_LIMITS.AUTOCOMPLETE}
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
    LIMIT ${SEARCH_LIMITS.AUTOCOMPLETE}
  `),
  
  departmentsAutocompleteFTS5: db.prepare(`
    SELECT fts.dept_abbr, fts.dept_name, bm25(departments_fts) as relevance_score
    FROM departments_fts fts
    WHERE departments_fts MATCH ?
    ORDER BY bm25(departments_fts)
    LIMIT ${SEARCH_LIMITS.AUTOCOMPLETE}
  `),

  // FTS5 Full search queries with weighted scoring
  coursesSearchFTS5: db.prepare(`
    SELECT fts.course_code_compact, fts.course_code_spaced, fts.course_name, fts.class_desc, fts.oscar_title, fts.rowid as class_id,
           bm25(courses_fts) as relevance_score,
           c.id, c.dept_abbr, c.course_num, c.total_students, c.total_grades,
           c.dept_abbr || ' ' || c.course_num AS class_name,
           (bm25(courses_fts) * ${SCORING_WEIGHTS.RELEVANCE} + LOG(COALESCE(NULLIF(c.total_students, 0), 1)) * ${SCORING_WEIGHTS.POPULARITY}) as weighted_score
    FROM courses_fts fts
    JOIN classdistribution c ON c.id = fts.rowid
    WHERE courses_fts MATCH ?
    ORDER BY weighted_score DESC
    LIMIT ${SEARCH_LIMITS.FULL_SEARCH}
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
    LIMIT ${SEARCH_LIMITS.FULL_SEARCH}
  `),
  
  departmentsSearchFTS5: db.prepare(`
    SELECT fts.dept_abbr, fts.dept_name, bm25(departments_fts) as relevance_score
    FROM departments_fts fts
    WHERE departments_fts MATCH ?
    ORDER BY bm25(departments_fts)
    LIMIT ${SEARCH_LIMITS.FULL_SEARCH}
  `),

  // Optimized FTS5 queries for exact matches (no JOINs, minimal overhead)
  coursesSearchFTS5Fast: db.prepare(`
    SELECT rowid as class_id, bm25(courses_fts) as relevance_score
    FROM courses_fts 
    WHERE courses_fts MATCH ?
    ORDER BY bm25(courses_fts)
    LIMIT ${SEARCH_LIMITS.FULL_SEARCH}
  `),
  
  coursesAutocompleteFTS5Fast: db.prepare(`
    SELECT rowid as class_id, bm25(courses_fts) as relevance_score
    FROM courses_fts 
    WHERE courses_fts MATCH ?
    ORDER BY bm25(courses_fts)
    LIMIT ${SEARCH_LIMITS.AUTOCOMPLETE}
  `)
};

// Helper function to check if FTS5 tables are available
export const hasFTS5Tables = (() => {
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