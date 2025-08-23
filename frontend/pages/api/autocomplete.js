import { getAutocompleteFTS5 } from "../../lib/db";

export default async function handler(req, res) {
  // Dynamic cache headers for autocomplete - longer cache for department prefixes
  const { q } = req.query;
  const isDeptPrefix = q && q.length <= 4 && /^[A-Z]+$/i.test(q.trim());
  
  if (isDeptPrefix) {
    // 10 minutes for department prefix autocomplete (very stable)
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  } else {
    // 5 minutes for general autocomplete
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  }
  
  if (!req.query.q) {
    res
      .status(400)
      .json({ success: false, error: "Missing query (q) in query string" });
    return;
  }

  // Don't autocomplete for very short queries to avoid noise
  if (q.trim().length < 2) {
    res.json({ 
      success: true, 
      data: { courses: [], professors: [], departments: [] } 
    });
    return;
  }

  try {
    const startTime = Date.now();
    const data = await getAutocompleteFTS5(q);
    const endTime = Date.now();
    
    // Add performance timing in development
    if (process.env.NODE_ENV !== "production") {
      console.log(`Autocomplete query "${q}" took ${endTime - startTime}ms`);
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error in autocomplete API:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error",
      data: { courses: [], professors: [], departments: [] }
    });
  }
}