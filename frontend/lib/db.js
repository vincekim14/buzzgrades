/**
 * Database Module - Backward Compatibility Layer
 * 
 * This file maintains 100% backward compatibility by re-exporting
 * all functions from the new modular database architecture.
 * 
 * The original monolithic implementation has been moved to db.legacy.js
 */

// Re-export everything from the new modular database system
export * from './db/index.js';