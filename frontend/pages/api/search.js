import { getSearchFTS5 } from "../../lib/db/index.js";
import { logBootRequest } from "../../lib/db/connection.js";

export default async function handler(req, res) {
  const startTime = Date.now();
  
  if (!req.query.q) {
    res
      .status(400)
      .json({ success: false, error: "Missing query (q) in query string" });
    return;
  }

  const { q } = req.query;

  // Add performance timing
  const searchStartTime = Date.now();
  const data = await getSearchFTS5(q);
  const searchDuration = Date.now() - searchStartTime;
  
  const totalDuration = Date.now() - startTime;
  
  // Add performance headers for monitoring
  res.setHeader('X-Search-Duration', `${searchDuration}ms`);
  res.setHeader('X-Total-Duration', `${totalDuration}ms`);
  
  // Add cache headers for hot queries (common department searches)
  const commonDeptSearches = ['math', 'chem', 'cs', 'phys', 'biol', 'econ', 'me', 'ece', 'isye'];
  const queryLower = q.toLowerCase().trim();
  if (commonDeptSearches.includes(queryLower) || /^[a-z]{2,4}$/i.test(queryLower)) {
    // Cache hot department searches for 30 seconds with stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
  }
  
  // Log slow searches in development
  if (process.env.NODE_ENV !== 'production' && totalDuration > 20) {
    console.log(`🐌 Slow search: "${q}" took ${totalDuration}ms (search: ${searchDuration}ms)`);
  }

  // Boot logging as specified
  logBootRequest(`/api/search?q=${q}`, totalDuration, searchDuration);

  res.json({ success: true, data });
}
