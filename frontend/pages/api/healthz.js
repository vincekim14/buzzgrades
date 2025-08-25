import { db } from "../../lib/db/connection.js";

/**
 * Health check endpoint for load balancer probes and readiness checks
 * 
 * Performs a light SELECT 1 query to verify database connectivity
 * and reports readiness status to avoid sending traffic before warmup completes.
 * 
 * Cold start mitigation plan.
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  
  try {
    // Perform light database connectivity check
    const result = db.prepare('SELECT 1 as health').get();
    const duration = Date.now() - startTime;
    
    if (result && result.health === 1) {
      // Database is ready
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('X-Health-Duration', `${duration}ms`);
      
      res.status(200).json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
        response_time_ms: duration
      });
    } else {
      // Database query returned unexpected result
      res.status(503).json({
        status: 'unhealthy',
        database: 'unexpected_result',
        error: 'Database query returned unexpected result',
        timestamp: new Date().toISOString(),
        response_time_ms: duration
      });
    }
  } catch (error) {
    // Database connection failed
    const duration = Date.now() - startTime;
    
    console.error('Health check failed:', error.message);
    
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
      response_time_ms: duration
    });
  }
}