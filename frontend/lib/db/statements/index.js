/**
 * Database Statements Index
 * Centralized access to all prepared statements
 */

export { courseStatements } from './courses.js';
export { professorStatements } from './professors.js';
export { departmentStatements } from './departments.js';
export { fts5Statements, hasFTS5Tables } from './fts5.js';
export { getBatchCourseDetails, batchStatements } from './batch-lookup.js';