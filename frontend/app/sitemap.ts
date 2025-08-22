import { MetadataRoute } from "next";
import {
  getEveryClassCode,
  getEveryDepartmentCode,
  getEveryProfessorCode,
} from "../lib/db";

type StringLike = string | { toString: () => string };

interface Course {
  dept_abbr: StringLike;
  course_num: StringLike;
  class_desc: string;
}

interface Professor {
  id: StringLike;
  name: string;
}

interface Department {
  dept_abbr: StringLike;
  dept_name: string;
}

const BASE_URL = "https://buzzgrades.org";

const cleanForUrl = (value: StringLike): string => {
  const str =
    typeof value === "string" ? value : value?.toString() ?? "undefined";
  return str
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "");
};

const createSitemapUrl = (path: string, ...segments: StringLike[]) => ({
  url: `${BASE_URL}/${path}/${segments.map(cleanForUrl).join("/")}`,
  changeFrequency: "yearly" as const,
});

const getAllRoutes = async () => {
  const courses = await getEveryClassCode();

  const courseRoutes = courses.map((course: Course) =>
    createSitemapUrl(
      "class",
      `${course.dept_abbr}${course.course_num}`,
      course.class_desc
    )
  );

  const profs = await getEveryProfessorCode();
  const profRoutes = profs.map((prof: Professor) =>
    createSitemapUrl("inst", prof.id, prof.name)
  );

  const depts = await getEveryDepartmentCode();
  const deptRoutes = depts.map((dept: Department) =>
    createSitemapUrl("dept", dept.dept_abbr, dept.dept_name)
  );

  const indexPage = {
    url: `${BASE_URL}/`,
    changeFrequency: "monthly" as const,
  };

  return [indexPage, ...courseRoutes, ...profRoutes, ...deptRoutes];
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getAllRoutes();
}
