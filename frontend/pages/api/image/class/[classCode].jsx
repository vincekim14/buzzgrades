import { ImageResponse } from "@vercel/og";
import { GPA_MAP } from "../../../../lib/letterTo";
import Stats from "../../../../components/Stats";

export const config = {
  runtime: "nodejs",
};

// Make sure the font exists in the specified path:
const IBMPlexSans = fetch(
  new URL("../../../../assets/IBMPlexSans-Bold.ttf", import.meta.url)
).then((res) => res.arrayBuffer());

export default async function handler(req) {
  // get classCode
  const { searchParams } = new URL(req.url);
  const classCode = searchParams.get("classCode");

  if (!classCode) return null;

  const data = await fetch(
    `https://buzzgrades.org/api/class/${classCode}`
  ).then((r) => r.json());

  const classData = data.data;

  // calculate the average GPA:

  const grades = classData.total_grades;

  const impactingGrades = Object.entries(grades ?? {}).filter(([grade]) =>
    Object.keys(GPA_MAP).includes(grade)
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
  ).toFixed(3);

  const dist = {
    grades: classData.total_grades,
    students: classData.total_students,
    isSummary: false,
  };

  const stats = Stats({ distribution: dist, isMobile: false, isStatic: true });
  const hasGrades = !Number.isNaN(averageGPA) && averageGPA > 0;

  const space = <span style={{ color: "transparent" }}>i</span>;
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 48,
          background: "white",
          width: "100%",
          height: "100%",
          display: "flex",
          textAlign: "center",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          backgroundColor: "#FCF9F9",
        }}
      >
        <h1
          style={{
            fontWeight: "bold",
            color: "#003057",
            fontSize: 65,
            marginTop: -50,
            marginRight: 20,
            marginLeft: 20,
          }}
        >
          {data.data.class_name.replace(/ /g, "")}: {data.data.class_desc}
        </h1>
        {hasGrades && (
          <p
            style={{
              color: "black",
              // flexGrow: 1,
              // position: "absolute",
              // top: -30,
              // left: "50%",
              // transform: "translate(-50%, 0)",
              fontSize: "24px",
              padding: "5px 10px 12.5px 10px",
              // border: "1px solid #003057",
              borderRadius: "8px",
              backgroundColor: "rgba(200, 40, 123, 0.2)",
            }}
          >
            GPA: {averageGPA}
          </p>
        )}

        {/* {chart} */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* <div
            style={{
              // border: "1px solid red",
              display: "flex",
              opacity: 0.2,
              marginRight: 16,
            }}
          >
            {stats.BarChart}
          </div> */}
          {/* REMOVED: Old S/P/N/W BarChart - not needed anymore */}
          <div
            style={{
              // border: "1px solid red",
              display: "flex",
              opacity: 0.55,
            }}
          >
            {stats.Component}
          </div>
        </div>

        <p
          style={{
            fontSize: "30px",
            fontFamily: "Inter, sans-serif",
            position: "absolute",
            bottom: -30,
            right: 15,
            opacity: 0.7,
          }}
        >
          Visit{space}
          <span
            style={{
              color: "#003057",
              textDecoration: "underline",
            }}
          >
            buzzgrades.org
          </span>
          {space}
          for more info!
        </p>
      </div>
    ),
    {
      width: 1200,
      height: 600,
      fonts: [
        {
          name: "IBM Plex Sans",
          data: await IBMPlexSans,
          style: "bold",
        },
      ],
      emoji: "twemoji",
    }
  );
}
