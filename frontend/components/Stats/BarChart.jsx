import { useState } from "react";
import { Tooltip } from "@chakra-ui/react";
// Import removed unused variables

// Grade descriptions for tooltips (GT grade system)
const GRADE_DESCRIPTIONS = {
  W: "Withdrew",
  V: "Audit",
  U: "Unsatisfactory (Pass/Fail)",
  S: "Satisfactory (Pass/Fail)",
  A: "Excellent (4.0)",
  B: "Good (3.0)",
  C: "Satisfactory (2.0)",
  D: "Passing (1.0)",
  F: "Failure (0.0)",
};

export const BarChart = ({ distribution, averageGPA, isMobile = true }) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // averageGPA parameter kept for future GPA line feature
  const { isSummary } = distribution;
  let scale = isSummary ? 1.3 : 1;
  if (isMobile) scale = 0.8;

  const BOTTOM_MARGIN = 5; // Reduced space beneath letters
  const LETTER_SPACING = 5; // Space needed for letter height and descenders
  const TOP_MARGIN = 20; // Reduced space for hover caption above bars

  const [hovered, setHovered] = useState(false);
  const [hoveredGrade, setHoveredGrade] = useState(null);

  const { grades } = distribution;

  // Create ordered grade list (W, V, U, S, F, D, C, B, A with A on RIGHT)
  // W, V, U, S: only show if count > 0 (to save space)
  // A-F: always show even if count is 0
  const nonLetterGrades = ["W", "V", "U", "S"].filter(
    (grade) => (grades?.[grade] ?? 0) > 0
  );
  const baseGrades = ["F", "D", "C", "B", "A"];
  const hasAnyLetterGrades = baseGrades.some(
    (grade) => (grades?.[grade] ?? 0) > 0
  );

  // Calculate dynamic padding based on grade distribution
  const calculatePadding = (hasLetterGrades, nonLetterCount) => {
    if (hasLetterGrades) return { LEFT_PADDING: 0, RIGHT_PADDING: 0 };
    
    const paddingMap = { 4: 0, 3: 20, 2: 45, 1: 70 };
    const padding = paddingMap[nonLetterCount] || 0;
    return { LEFT_PADDING: padding, RIGHT_PADDING: padding };
  };
  
  const { LEFT_PADDING, RIGHT_PADDING } = calculatePadding(hasAnyLetterGrades, nonLetterGrades.length);
  const BAR_GRAPH_HEIGHT = 50 * scale - BOTTOM_MARGIN; // Taller bars

  // If no A-F grades exist, only show W, V, U, S that have students > 0
  const letterGrades = hasAnyLetterGrades
    ? [...nonLetterGrades, ...baseGrades]
    : nonLetterGrades;

  // Calculate min width per bar
  const MIN_BAR_WIDTH = isSummary ? 60 : 50; // Minimum width per bar in pixels
  const MIN_SPACING = 3; // Minimum spacing between bars
  // Dynamic width based on number of grades
  const calculatedWidth = letterGrades.length * (MIN_BAR_WIDTH + MIN_SPACING);

  // Base widths with minimum constraints
  // const baseWidth = isSummary ? 450 : 325;
  const BAR_GRAPH_WIDTH = calculatedWidth;
  // const BAR_GRAPH_WIDTH = Math.max(calculatedWidth, baseWidth);

  const maxGrade = Math.max(...Object.values(grades ?? {}));
  const totalStudents = Object.values(grades).reduce(
    (total, gradeCount) => total + gradeCount,
    0
  );

  const barWidth = BAR_GRAPH_WIDTH / letterGrades.length;
  const barSpacing = 2; // Small gap between bars
  const actualBarWidth = barWidth - barSpacing;

  // Calculate bar heights and colors
  const barData = letterGrades.map(
    (grade, index) => {
    const count = grades?.[grade] ?? 0;
    const height = maxGrade > 0 ? (count / maxGrade) * BAR_GRAPH_HEIGHT : 0;
    const percentage = totalStudents > 0 ? ((count * 100) / totalStudents).toFixed(1) : "0.0";

    return {
      grade,
      count,
      height,
      percentage,
      x: LEFT_PADDING + index * barWidth + barSpacing / 2,
      labelX: LEFT_PADDING + index * barWidth + barWidth / 2,
    };
  });

  // GPA calculations removed as unused

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Determine which bar is being hovered (account for left padding)
    const barIndex = Math.floor((x - LEFT_PADDING) / barWidth);
    if (barIndex >= 0 && barIndex < letterGrades.length) {
      setHovered(true);
      setHoveredGrade(barIndex);
    }
  };

  const handleMouseEnter = () => setHovered(true);
  const handleMouseLeave = () => {
    setHovered(false);
    setHoveredGrade(null);
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <svg
        height={BAR_GRAPH_HEIGHT + BOTTOM_MARGIN + TOP_MARGIN + LETTER_SPACING}
        width={BAR_GRAPH_WIDTH + LEFT_PADDING + RIGHT_PADDING}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {/* Average GPA line - ends at top of intersecting bar */}
        {/* <line
          x1={gpaXPosition}
          y1={gpaLineEndY}
          x2={gpaXPosition}
          y2={BAR_GRAPH_HEIGHT + TOP_MARGIN}
          style={{
            stroke: "rgba(0, 0, 0, 0.6)",
            strokeWidth: 2,
          }}
        /> */}

        {/* Bars */}
        {barData.map((bar, index) => (
          <g key={bar.grade}>
            {/* Hover indicator */}
            {hovered && hoveredGrade === index && (
              <>
                <line
                  x1={bar.labelX}
                  y1={TOP_MARGIN}
                  x2={bar.labelX}
                  y2={BAR_GRAPH_HEIGHT + TOP_MARGIN}
                  style={{
                    stroke: "rgba(0, 0, 0, 0.1)",
                    strokeWidth: 2,
                  }}
                />
                <rect
                  x={bar.x}
                  y={BAR_GRAPH_HEIGHT + TOP_MARGIN - bar.height}
                  width={actualBarWidth}
                  height={bar.height}
                  rx={3}
                  ry={3}
                  style={{
                    fill: "rgba(0, 0, 0, 0.1)",
                    stroke: "rgba(0, 0, 0, 0.3)",
                    strokeWidth: 1,
                  }}
                />
              </>
            )}

            {/* Main bar */}
            <rect
              x={bar.x}
              y={BAR_GRAPH_HEIGHT + TOP_MARGIN - bar.height}
              width={actualBarWidth}
              height={bar.height}
              rx={3}
              ry={3}
              style={{
                fill: "#B3A369",
                opacity: hovered && hoveredGrade === index ? 0.8 : 0.7,
              }}
            />

            {/* Grade label with tooltip for all grades */}
            {GRADE_DESCRIPTIONS[bar.grade] ? (
              <Tooltip label={GRADE_DESCRIPTIONS[bar.grade]} hasArrow>
                <text
                  x={bar.labelX}
                  y={BAR_GRAPH_HEIGHT + TOP_MARGIN + 10}
                  style={{
                    textAnchor: "middle",
                    fontSize: 9,
                    userSelect: "none",
                    fontWeight: "bold",
                    fill: "#003057",
                  }}
                >
                  {bar.grade}
                </text>
              </Tooltip>
            ) : (
              <text
                x={bar.labelX}
                y={BAR_GRAPH_HEIGHT + TOP_MARGIN + 10}
                style={{
                  textAnchor: "middle",
                  fontSize: 9,
                  userSelect: "none",
                  fontWeight: "bold",
                  fill: "#003057",
                }}
              >
                {bar.grade}
              </text>
            )}
          </g>
        ))}

        {/* GPA number label positioned above the line endpoint - rendered after bars to appear on top */}
        {/* <text
          x={gpaXPosition}
          y={gpaLineEndY - 5}
          style={{
            textAnchor: "middle",
            fontSize: 8,
            fontWeight: "bold",
            fill: "#003057",
          }}
        >
          {averageGPA}
        </text> */}

        {/* Hover tooltip - positioned above bars */}
        {hovered && hoveredGrade !== null && (
          <text
            x={(BAR_GRAPH_WIDTH + LEFT_PADDING + RIGHT_PADDING) / 2}
            y={10}
            style={{
              textAnchor: "middle",
              dominantBaseline: "middle",
              fontSize: 12,
              userSelect: "none",
              fontWeight: "bold",
              fill: "#003057",
            }}
          >
            {barData[hoveredGrade].count} student
            {barData[hoveredGrade].count !== 1 && "s"} got{" "}
            {barData[hoveredGrade].grade.startsWith("A") ||
            barData[hoveredGrade].grade.startsWith("F")
              ? "an"
              : "a"}{" "}
            {barData[hoveredGrade].grade} ({barData[hoveredGrade].percentage}%)
          </text>
        )}

      </svg>
    </div>
  );
};
