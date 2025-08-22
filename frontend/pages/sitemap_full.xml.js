import {
  getEveryClassCode,
  getEveryDepartmentCode,
  getEveryProfessorCode,
} from "../lib/db";

const cleanPrimaryID = (id) => {
  return id.toString().replaceAll(" ", "");
};

const cleanDescription = (desc) => {
  return desc.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
};

async function generateSiteMap() {
  const startXML = `<?xml version="1.0" encoding="UTF-8"?>`;

  const courses = await getEveryClassCode();

  const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'https://buzzgrades.org';
  
  const courseXML = courses.map(
    (course) => `
  <url>
    <loc>${baseURL}/class/${cleanPrimaryID(
      `${course.dept_abbr}${course.course_num}`
    )}/${cleanDescription(course.class_desc)}</loc>
    <image:image>
      <image:loc>${baseURL}/api/image/class/${cleanPrimaryID(
        `${course.dept_abbr}${course.course_num}`
      )}</image:loc>
    </image:image>
  </url>`
  );

  const profs = await getEveryProfessorCode();

  const profXML = profs.map(
    (prof) => `
  <url>
    <loc>${baseURL}/inst/${cleanPrimaryID(prof.id)}/${cleanDescription(
      prof.name
    )}</loc>
    <image:image>
      <image:loc>${baseURL}/api/image/prof/${cleanPrimaryID(
        prof.id
      )}</image:loc>
    </image:image>
    </url>`
  );

  const depts = await getEveryDepartmentCode();

  const deptXML = depts.map(
    (dept) => `
  <url>
    <loc>${baseURL}/dept/${cleanPrimaryID(
      dept.dept_abbr
    )}/${cleanDescription(dept.dept_name)}</loc>
    <image:image>
      <image:loc>${baseURL}/api/image/dept/${cleanPrimaryID(
        dept.dept_abbr
      )}</image:loc>
    </image:image>
    </url>`
  );

  const indexPage = `
  <url>
    <loc>${baseURL}/</loc>
    <image:image>
      <!-- PLACEHOLDER: Main promotional image for SEO and social sharing (1200x630px) -->
      <image:loc>${baseURL}/images/advert.png</image:loc>
    </image:image>
  </url>
  `;

  return `${startXML}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${indexPage}
${courseXML.join("\n")}
${profXML.join("\n")}
${deptXML.join("\n")}
</urlset>`;
}

function SiteMap() {
  // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res }) {
  // We generate the XML sitemap with the posts data
  const sitemap = await generateSiteMap();

  res.setHeader("Content-Type", "text/xml");
  // we send the XML to the browser
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
}

export default SiteMap;
