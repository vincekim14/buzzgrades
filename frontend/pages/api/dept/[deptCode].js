import { getClassDistribtionsInDept, getDeptInfo } from "../../../lib/db/index.js";
import { logBootRequest } from "../../../lib/db/connection.js";

export default async function handler(req, res) {
  const startTime = Date.now();
  
  if (!req.query.deptCode) {
    res
      .status(400)
      .json({ success: false, error: "Missing deptCode in query string" });
    return;
  }

  const { deptCode } = req.query;

  // Parallelize info and distributions fetching for better performance
  const dbStartTime = Date.now();
  const [info, distributions] = await Promise.all([
    getDeptInfo(deptCode),
    getClassDistribtionsInDept(deptCode)
  ]);
  const dbDuration = Date.now() - dbStartTime;

  if (info.length === 0) {
    res.status(404).json({ success: false, error: "Department not found" });
    return;
  }

  const totalDuration = Date.now() - startTime;
  
  // Add performance headers for end-to-end timing
  res.setHeader('X-DB-Duration', `${dbDuration}ms`);
  res.setHeader('X-Total-Duration', `${totalDuration}ms`);

  // Boot logging
  logBootRequest(`/api/dept/${deptCode}`, totalDuration, dbDuration);

  res.status(200).json({
    success: true,
    data: {
      ...info[0],
      distributions,
    },
  });
}
