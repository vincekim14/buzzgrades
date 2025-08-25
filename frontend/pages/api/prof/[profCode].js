import { getInstructorClasses, getInstructorInfo } from "../../../lib/db/index.js";
import { logBootRequest } from "../../../lib/db/connection.js";

export default async function handler(req, res) {
  const startTime = Date.now();
  
  if (!req.query.profCode) {
    res
      .status(400)
      .json({ success: false, error: "Missing profCode in query string" });
    return;
  }

  const { profCode } = req.query;

  // Parallelize info and distributions fetching for better performance
  const dbStartTime = Date.now();
  const [info, distributions] = await Promise.all([
    getInstructorInfo(profCode),
    getInstructorClasses(profCode)
  ]);
  const dbDuration = Date.now() - dbStartTime;

  if (info.length === 0) {
    res.status(404).json({ success: false, error: "Professor not found" });
    return;
  }

  const totalDuration = Date.now() - startTime;
  
  // Add strong cache headers: 7 days + 30 days SWR
  res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
  
  // Add performance headers for end-to-end timing
  res.setHeader('X-DB-Duration', `${dbDuration}ms`);
  res.setHeader('X-Total-Duration', `${totalDuration}ms`);

  // Boot logging
  logBootRequest(`/api/prof/${profCode}`, totalDuration, dbDuration);

  res.status(200).json({
    success: true,
    data: {
      ...info[0],
      distributions,
    },
  });
}
