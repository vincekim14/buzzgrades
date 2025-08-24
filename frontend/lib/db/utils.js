// GPA mapping for GT letter grades (no plus/minus at GT)
const GPA_MAP = {
  A: 4.0,
  B: 3.0,
  C: 2.0,
  D: 1.0,
  F: 0.0,
};

// Reusable function to calculate aggregate statistics from grades
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

const parseJSONFromRow = (row, tryJSONParse) => {
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

const parseCourseCodesInText = (text) => {
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

export {
  calculateAggregateStats,
  parseJSONFromRow,
  groupBy,
  summarizeTerms,
  parseCourseCodesInText,
  GPA_MAP
};