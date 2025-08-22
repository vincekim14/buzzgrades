import { useState } from "react";
import { Tooltip } from "@chakra-ui/react";

// Grade descriptions for tooltips
const GRADE_DESCRIPTIONS = {
  W: "Withdrew",
  V: "Audit",
  U: "Unsatisfactory (Pass/Fail)",
  S: "Satisfactory (Pass/Fail)",
};

export const StaticBarChart = ({ distribution, averageGPA }) => {
  const { isSummary } = distribution;
  const [hoveredGradeIndex, setHoveredGradeIndex] = useState(null);
  const [hovered, setHovered] = useState(false);
  const scale = 3.5;
  const BOTTOM_MARGIN = 15;
  const TOP_MARGIN = 15; // Reduced space for hover caption above bars
  const LEFT_PADDING = 20; // Padding to prevent GPA text cutoff
  const RIGHT_PADDING = 20; // Padding to prevent GPA text cutoff
  const BAR_GRAPH_HEIGHT = 60 * scale - BOTTOM_MARGIN; // Taller bars
  // Fixed widths for static images: 450px for big cards, 325px for small cards
  const BAR_GRAPH_WIDTH = (isSummary ? 450 : 325) * scale;

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

  // If no A-F grades exist, only show W, V, U, S that have students
  const letterGrades = hasAnyLetterGrades
    ? [...nonLetterGrades, ...baseGrades]
    : nonLetterGrades;

  const maxGrade = Math.max(...Object.values(grades ?? {}));
  const totalStudents = Object.values(grades).reduce(
    (total, gradeCount) => total + gradeCount,
    0
  );

  const barWidth = BAR_GRAPH_WIDTH / letterGrades.length;
  const barSpacing = 2;
  const actualBarWidth = barWidth - barSpacing;

  // Calculate bar heights and colors
  const barData = letterGrades.map((grade, index) => {
    const count = grades?.[grade] ?? 0;
    const height = maxGrade > 0 ? (count / maxGrade) * BAR_GRAPH_HEIGHT : 0;
    const percentage =
      totalStudents > 0 ? ((count * 100) / totalStudents).toFixed(1) : "0.0";

    return {
      grade,
      count,
      height,
      percentage,
      x: LEFT_PADDING + index * barWidth + barSpacing / 2,
      labelX: LEFT_PADDING + index * barWidth + barWidth / 2,
    };
  });

  const maxGPA = 4;

  // Calculate which bar the GPA line intersects and its height
  const gpaXPosition = LEFT_PADDING + (BAR_GRAPH_WIDTH * averageGPA) / maxGPA;

  // Mouse event handlers for count tooltip
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Determine which bar is being hovered (account for left padding)
    const barIndex = Math.floor((x - LEFT_PADDING) / barWidth);
    if (barIndex >= 0 && barIndex < letterGrades.length) {
      setHovered(true);
      setHoveredGradeIndex(barIndex);
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setHoveredGradeIndex(null);
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <svg
        height={BAR_GRAPH_HEIGHT + BOTTOM_MARGIN + TOP_MARGIN}
        width={BAR_GRAPH_WIDTH + LEFT_PADDING + RIGHT_PADDING}
        viewBox={`0 0 ${BAR_GRAPH_WIDTH + LEFT_PADDING + RIGHT_PADDING} ${
          BAR_GRAPH_HEIGHT + BOTTOM_MARGIN + TOP_MARGIN
        }`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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
        {barData.map((bar) => (
          <g key={bar.grade}>
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
                opacity: 0.7,
              }}
            />

            {/* Grade label with tooltip for special grades */}
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
        {hovered && hoveredGradeIndex !== null && (
          <text
            x={(BAR_GRAPH_WIDTH + LEFT_PADDING + RIGHT_PADDING) / 2}
            y={15}
            style={{
              textAnchor: "middle",
              dominantBaseline: "middle",
              fontSize: 12,
              userSelect: "none",
              fontWeight: "bold",
              fill: "#003057",
            }}
          >
            {barData[hoveredGradeIndex].count} student
            {barData[hoveredGradeIndex].count !== 1 && "s"} got{" "}
            {barData[hoveredGradeIndex].grade.startsWith("A") ||
            barData[hoveredGradeIndex].grade.startsWith("F")
              ? "an"
              : "a"}{" "}
            {barData[hoveredGradeIndex].grade} (
            {barData[hoveredGradeIndex].percentage}%)
          </text>
        )}
      </svg>
    </div>
  );
};
