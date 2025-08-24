// Export all database functions
export {
  getDistribution,
  getClassInfo,
  getEveryClassCode,
  getEveryProfessorCode,
  getEveryDepartmentCode,
  getDeptInfo,
  getClassDistribtionsInDept,
  getInstructorInfo,
  getInstructorClasses
} from './queries.js';

export { getSearch } from './search.js';
export { getSearchFTS5 } from './fts-search.js';

export {
  calculateAggregateStats,
  parseJSONFromRow,
  groupBy,
  summarizeTerms,
  parseCourseCodesInText,
  GPA_MAP
} from './utils.js';

export {
  db,
  promisedQuery,
  getCourseInfo,
  tryJSONParse
} from './connection.js';