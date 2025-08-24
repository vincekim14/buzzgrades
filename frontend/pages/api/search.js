import { getSearchFTS5 } from "../../lib/db/index.js";

export default async function handler(req, res) {
  if (!req.query.q) {
    res
      .status(400)
      .json({ success: false, error: "Missing query (q) in query string" });
    return;
  }

  const { q } = req.query;

  res.json({ success: true, data: await getSearchFTS5(q) });
}
