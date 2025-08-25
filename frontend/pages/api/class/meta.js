import { getCourseInfo, logBootRequest } from "../../../lib/db/connection.js";

export default function handler(req, res) {
  const startTime = Date.now();
  
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const { codes } = req.query;
  
  if (!codes) {
    res.status(400).json({ success: false, error: 'Missing codes parameter' });
    return;
  }

  // Parse comma-separated codes and dedupe
  const codeList = codes.split(',').map(code => code.trim()).filter(Boolean);
  const uniqueCodes = [...new Set(codeList)];
  
  if (uniqueCodes.length === 0) {
    res.status(400).json({ success: false, error: 'No valid codes provided' });
    return;
  }

  // Batch resolve all codes using in-memory getCourseInfo
  const dbStartTime = Date.now();
  const results = {};
  
  for (const code of uniqueCodes) {
    const courseInfo = getCourseInfo(code);
    if (courseInfo) {
      results[code] = {
        exists: true,
        title: courseInfo.title || null
      };
      // courseInfo.oscarTitle || courseInfo.courseTitle
    } else {
      results[code] = {
        exists: false,
        title: null
      };
    }
  }
  
  const dbDuration = Date.now() - dbStartTime;
  const totalDuration = Date.now() - startTime;

  // Add performance headers
  res.setHeader('X-DB-Duration', `${dbDuration}ms`);
  res.setHeader('X-Total-Duration', `${totalDuration}ms`);
  
  // Strong cache headers for course metadata (rarely changes)
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
  
  // Boot logging for cold start mitigation
  logBootRequest(`/api/class/meta?codes=${codes}`, totalDuration, dbDuration);

  res.status(200).json({
    success: true,
    data: results
  });
}