/**
 * Database Connection Module
 * Handles SQLite database setup and optimization
 */

import Database from "better-sqlite3";
import path from "path";
import { DATABASE } from '../constants.js';

// Database path (centralized)
export const dbPath = path.resolve(process.cwd(), "../data-app/ProcessedData.db");

// Initialize database with better-sqlite3 and optimizations
export const db = new Database(dbPath, { 
  readonly: false,
  fileMustExist: true
});

// Apply read-only safe SQLite optimizations
export const initializeDatabase = () => {
  try {
    DATABASE.PRAGMAS.forEach(pragma => {
      db.pragma(pragma);
    });
    console.log("✅ Database optimizations applied successfully");
  } catch (error) {
    console.warn("⚠️ Some database optimizations couldn't be applied:", error.message);
  }
};

// Initialize on import
initializeDatabase();