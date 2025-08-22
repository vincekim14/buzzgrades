import { GPA_MAP } from "../../lib/letterTo";
import { BarChart } from "./BarChart";
// import { StaticBarChart } from "./StaticBarChart";
// OLD: import { AreaChart } from "./AreaChart"; // RENAMED to BarChart
// OLD: import { StaticAreaChart } from "./StaticAreaChart"; // RENAMED to StaticBarChart

export default function Stats({
  distribution = {},
  isMobile = false,
  isStatic = false,
}) {
  const { grades } = distribution;

  const impactingGrades = Object.entries(grades ?? {}).filter(([grade]) =>
    Object.keys(GPA_MAP).includes(grade)
  );

  const allGrades = Object.entries(grades ?? {});

  const totalStudents = allGrades.reduce(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (acc, [_, count]) => acc + count,
    0
  );

  const totalImpactingStudents = impactingGrades.reduce(
    (acc, [, count]) => acc + count,
    0
  );

  const averageGPA = (
    impactingGrades.reduce(
      (acc, [grade, count]) => acc + GPA_MAP[grade] * count,
      0
    ) / totalImpactingStudents
  ).toFixed(2); // 2 decimal places, toFixed(3) is not too helpful

  // find closest letter grade to averageGPA
  const averageGradeLetter = Object.entries(GPA_MAP).reduce(
    (acc, [letter, gpa]) => {
      if (Math.abs(gpa - averageGPA) < Math.abs(acc[1] - averageGPA)) {
        return [letter, gpa];
      }
      return acc;
    }
  )[0];

  // get the letter grade with the most students
  const mostStudents = allGrades.reduce(
    (acc, [grade, count]) => (count > acc[1] ? [grade, count] : acc),
    ["", 0]
  )[0];

  // what percentage of the students got the most common grade
  const mostStudentsPercent = (
    (100 * (grades?.[mostStudents] ?? 0)) /
    totalStudents
  ).toFixed(1); // 1 decimal place, toFixed(0) is too broad

  const BarChartComponent = isStatic ? BarChart : BarChart; // StaticBarChart commented out
  
  // Always show chart if there are any students with grades (not just GPA-impacting grades)
  const hasAnyGrades = totalStudents > 0;
  
  return {
    Component: hasAnyGrades ? (
      <BarChartComponent
        isMobile={isMobile}
        distribution={distribution}
        averageGPA={averageGPA}
      />
    ) : null,
    averageGPA,
    averageGradeLetter,
    mostStudents,
    mostStudentsPercent,
  };
}
