import { getSearchFTS5 } from "../../lib/db";

export default async function handler(req, res) {
  // Dynamic cache headers based on query type
  const { q } = req.query;
  
  // Longer cache for common prefixes and exact course codes
  const isExactCourse = q && /^[A-Z]{2,4}\d{4}[A-Z]?$/i.test(q.replace(/\s/g, ''));
  const isDeptPrefix = q && /^[A-Z]{2,4}$/i.test(q.trim());
  
  if (isExactCourse || isDeptPrefix) {
    // 5 minutes for exact matches and department prefixes
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  } else {
    // 3 minutes for general searches
    res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=360');
  }
  
  if (!q) {
    res
      .status(400)
      .json({ success: false, error: "Missing query (q) in query string" });
    return;
  }

  try {
    const startTime = Date.now();
    
    // Use FTS5 search with fallback to LIKE queries
    const data = await getSearchFTS5(q);
    
    const endTime = Date.now();
    
    // Add performance timing in development
    if (process.env.NODE_ENV !== "production") {
      console.log(`Search query "${q}" took ${endTime - startTime}ms`);
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error in search API:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
}
