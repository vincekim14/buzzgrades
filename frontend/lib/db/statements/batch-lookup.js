/**
 * Optimized Batch Lookup Module
 * Pre-prepared statements for efficient batch course lookups
 */

import { db } from '../connection.js';
import { PERFORMANCE } from '../../constants.js';

// Pre-prepared batch statements for common sizes
export const batchStatements = {
  single: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name,
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE id = ?
  `),
  
  batch2: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name,
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE id IN (?,?)
  `),
  
  batch3: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name,
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE id IN (?,?,?)
  `),
  
  batch5: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name,
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE id IN (?,?,?,?,?)
  `),
  
  batch10: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name,
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE id IN (?,?,?,?,?,?,?,?,?,?)
  `)
};

// Optimized batch course details lookup
export const getBatchCourseDetails = (courseIds) => {
  if (!courseIds || courseIds.length === 0) return [];
  
  const ids = courseIds.map(c => c.class_id);
  let courses = [];
  
  // Use pre-prepared statements when possible for better performance
  switch (courseIds.length) {
    case 1:
      courses = [batchStatements.single.get(ids[0])].filter(Boolean);
      break;
    case 2:
      courses = batchStatements.batch2.all(...ids);
      break;
    case 3:
      courses = batchStatements.batch3.all(...ids);
      break;
    case 5:
      courses = batchStatements.batch5.all(...ids);
      break;
    case 10:
      courses = batchStatements.batch10.all(...ids);
      break;
    default:
      // For other sizes, create dynamic query (less optimal but still better than individual queries)
      if (courseIds.length <= PERFORMANCE.BATCH_SIZE_THRESHOLD) {
        courses = [batchStatements.single.get(ids[0])].filter(Boolean);
      } else {
        const placeholders = courseIds.map(() => '?').join(',');
        const dynamicStmt = db.prepare(`
          SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name,
                 class_desc, total_students, total_grades
          FROM classdistribution
          WHERE id IN (${placeholders})
        `);
        courses = dynamicStmt.all(...ids);
      }
  }
  
  // Merge relevance scores back
  return courses.map(course => {
    const match = courseIds.find(c => c.class_id === course.id);
    return {
      ...course,
      relevance_score: match?.relevance_score || 0
    };
  });
};