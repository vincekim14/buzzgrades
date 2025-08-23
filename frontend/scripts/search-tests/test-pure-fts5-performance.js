#!/usr/bin/env node

/**
 * Pure FTS5 vs LIKE Performance Test
 * 
 * This script creates a PURE FTS5 implementation that bypasses
 * all fallback logic to test actual FTS5 vs LIKE performance.
 */

import Database from "better-sqlite3";
import path from "path";
import { performance } from "perf_hooks";

console.log("⚡ Pure FTS5 vs LIKE Performance Test");
console.log("====================================\n");

// Database connection
const dbPath = path.resolve(process.cwd(), "../data-app/ProcessedData.db");
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

// Apply optimizations
try {
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB
} catch (error) {
  console.warn("Some pragma settings couldn't be applied:", error.message);
}

// Pure FTS5 statements (no fallback logic)
const pureFTS5Statements = {
  // Force FTS5 usage for courses
  coursesSearchPureFTS5: db.prepare(`
    SELECT fts.course_code, fts.course_name, fts.class_desc, fts.oscar_title, fts.class_id,
           bm25(courses_fts) as relevance_score,
           c.id, c.dept_abbr, c.course_num, c.total_students, c.total_grades,
           c.dept_abbr || ' ' || c.course_num AS class_name
    FROM courses_fts fts
    JOIN classdistribution c ON c.id = fts.class_id
    WHERE courses_fts MATCH ?
    ORDER BY bm25(courses_fts), c.total_students DESC
    LIMIT 10
  `),
  
  // Force FTS5 usage for professors
  professorsSearchPureFTS5: db.prepare(`
    SELECT fts.name, bm25(professors_fts) as relevance_score,
           p.id, p.RMP_score
    FROM professors_fts fts
    JOIN professor p ON fts.rowid = p.id
    WHERE professors_fts MATCH ?
    ORDER BY bm25(professors_fts), p.RMP_score DESC NULLS LAST
    LIMIT 10
  `),
  
  // Force FTS5 usage for departments
  departmentsSearchPureFTS5: db.prepare(`
    SELECT fts.dept_abbr, fts.dept_name, bm25(departments_fts) as relevance_score
    FROM departments_fts fts
    WHERE departments_fts MATCH ?
    ORDER BY bm25(departments_fts)
    LIMIT 10
  `)
};

// LIKE statements (current optimized approach)
const likeStatements = {
  coursesSearchLike: db.prepare(`
    SELECT id, dept_abbr, course_num, dept_abbr || ' ' || course_num AS class_name, 
           class_desc, total_students, total_grades
    FROM classdistribution
    WHERE (dept_abbr || course_num LIKE ? OR REPLACE(class_desc, ' ', '') LIKE ?)
    ORDER BY total_students DESC
    LIMIT 10
  `),
  
  professorsSearchLike: db.prepare(`
    SELECT p.*, 
           json_group_array(CASE WHEN td.grades IS NOT NULL THEN td.grades END) as all_grades
    FROM professor p
    LEFT JOIN distribution d ON p.id = d.professor_id
    LEFT JOIN termdistribution td ON d.id = td.dist_id
    WHERE REPLACE(p.name, ' ', '') LIKE ? AND
          EXISTS (SELECT 1 FROM distribution d2, classdistribution c
                  WHERE d2.professor_id = p.id AND d2.class_id = c.id)
    GROUP BY p.id
    ORDER BY p.RMP_score DESC NULLS LAST
    LIMIT 10
  `),
  
  departmentsSearchLike: db.prepare(`
    SELECT dd.*, 
           json_group_array(CASE WHEN cd.total_grades IS NOT NULL THEN cd.total_grades END) as all_grades
    FROM departmentdistribution dd
    LEFT JOIN classdistribution cd ON dd.dept_abbr = cd.dept_abbr AND dd.campus = cd.campus
    WHERE (dd.dept_name LIKE ? OR dd.dept_abbr LIKE ?)
    GROUP BY dd.campus, dd.dept_abbr
    LIMIT 10
  `)
};

// Convert query to FTS5 format (simplified, no fallback logic)
const toFTS5QuerySimple = (search) => {
  if (!search || !search.trim()) return null;
  
  const trimmed = search.trim();
  
  // Course code patterns
  const courseCodeExact = trimmed.match(/^([A-Z]{2,4})\s*(\d{4}[A-Z]?)$/i);
  if (courseCodeExact) {
    const dept = courseCodeExact[1].toUpperCase();
    const number = courseCodeExact[2];
    return `"${dept}${number}" OR "${dept} ${number}"`;
  }
  
  const courseCodePartial = trimmed.match(/^([A-Z]{2,4})\s*(\d{1,3})?$/i);
  if (courseCodePartial) {
    const dept = courseCodePartial[1].toUpperCase();
    const partialNumber = courseCodePartial[2];
    
    if (partialNumber) {
      return `${dept}${partialNumber}*`;
    } else {
      return `${dept}*`;
    }
  }
  
  // Multi-word phrases
  if (trimmed.includes(' ')) {
    const escapedTrimmed = trimmed.replace(/"/g, '""');
    return `"${escapedTrimmed}"`;
  }
  
  // Single word prefix
  if (trimmed.length >= 3 && /^[a-zA-Z]+$/i.test(trimmed)) {
    return `${trimmed}*`;
  }
  
  // Fallback to exact phrase
  return `"${trimmed.replace(/"/g, '""')}"`;
};

// Pure FTS5 search function
const searchPureFTS5 = (search) => {
  const fts5Query = toFTS5QuerySimple(search);
  if (!fts5Query) return { courses: [], professors: [], departments: [] };
  
  try {
    const courses = pureFTS5Statements.coursesSearchPureFTS5.all(fts5Query);
    const professors = pureFTS5Statements.professorsSearchPureFTS5.all(fts5Query);
    const departments = pureFTS5Statements.departmentsSearchPureFTS5.all(fts5Query);
    
    return { courses, professors, departments };
  } catch (error) {
    console.warn(`FTS5 query failed for "${search}": ${error.message}`);
    return { courses: [], professors: [], departments: [] };
  }
};

// Pure LIKE search function
const searchPureLike = (search) => {
  const searchParam = `%${search.replace(/ /g, "")}%`;
  
  try {
    const courses = likeStatements.coursesSearchLike.all(searchParam, searchParam);
    const professors = likeStatements.professorsSearchLike.all(searchParam);
    const departments = likeStatements.departmentsSearchLike.all(searchParam, searchParam);
    
    return { courses, professors, departments };
  } catch (error) {
    console.warn(`LIKE query failed for "${search}": ${error.message}`);
    return { courses: [], professors: [], departments: [] };
  }
};

// Statistical analysis helper
const calculateStats = (times) => {
  if (times.length === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
  
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted.length % 2 === 0 
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  
  const variance = times.reduce((acc, time) => acc + Math.pow(time - mean, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean: Math.round(mean * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
    stdDev: Math.round(stdDev * 1000) / 1000,
    min: Math.round(sorted[0] * 1000) / 1000,
    max: Math.round(sorted[sorted.length - 1] * 1000) / 1000
  };
};

// Test categories with queries that should benefit from FTS5
const testCategories = {
  exactCourses: {
    name: "Exact Course Codes",
    queries: ["CS1301", "CS1331", "MATH1551", "PHYS2211", "ECE2031"],
    expectedWinner: "FTS5"
  },
  departmentPrefixes: {
    name: "Department Prefixes", 
    queries: ["CS", "MATH", "ECE", "PHYS", "BIOL"],
    expectedWinner: "FTS5"
  },
  partialCourses: {
    name: "Partial Course Codes",
    queries: ["CS13", "MATH15", "ECE20", "PHYS22"],
    expectedWinner: "FTS5"
  },
  professorNames: {
    name: "Professor Names",
    queries: ["Smith", "Johnson", "Brown", "Davis", "Wilson"],
    expectedWinner: "FTS5"
  },
  departmentNames: {
    name: "Department Names",
    queries: ["Computer Science", "Mathematics", "Physics", "Chemistry"],
    expectedWinner: "FTS5"
  },
  courseTitles: {
    name: "Course Titles",
    queries: ["Linear Algebra", "Organic Chemistry", "Computer Graphics", "Data Structures"],
    expectedWinner: "FTS5"
  }
};

// Run pure performance comparison
const runPurePerformanceTest = async () => {
  console.log("🚀 Testing PURE FTS5 vs LIKE Performance (No Fallbacks)\n");
  
  const categoryResults = [];
  
  for (const [categoryKey, categoryData] of Object.entries(testCategories)) {
    console.log(`\n🔍 Testing: ${categoryData.name}`);
    console.log(`🎯 Expected Winner: ${categoryData.expectedWinner}`);
    console.log("─".repeat(60));
    
    const fts5Times = [];
    const likeTimes = [];
    let fts5TotalResults = 0;
    let likeTotalResults = 0;
    let fts5Errors = 0;
    let likeErrors = 0;
    
    for (const query of categoryData.queries) {
      console.log(`\n   Query: "${query}"`);
      
      // Multiple runs for statistical reliability
      const queryFts5Times = [];
      const queryLikeTimes = [];
      
      for (let run = 0; run < 10; run++) {
        try {
          // Pure FTS5 test
          const fts5Start = performance.now();
          const fts5Results = searchPureFTS5(query);
          const fts5End = performance.now();
          queryFts5Times.push(fts5End - fts5Start);
          
          if (run === 0) {
            fts5TotalResults += (fts5Results.courses?.length || 0) + 
                               (fts5Results.professors?.length || 0) + 
                               (fts5Results.departments?.length || 0);
          }
        } catch (error) {
          fts5Errors++;
          console.log(`     FTS5 Error: ${error.message}`);
        }
        
        try {
          // Pure LIKE test
          const likeStart = performance.now();
          const likeResults = searchPureLike(query);
          const likeEnd = performance.now();
          queryLikeTimes.push(likeEnd - likeStart);
          
          if (run === 0) {
            likeTotalResults += (likeResults.courses?.length || 0) + 
                               (likeResults.professors?.length || 0) + 
                               (likeResults.departments?.length || 0);
          }
        } catch (error) {
          likeErrors++;
          console.log(`     LIKE Error: ${error.message}`);
        }
      }
      
      const fts5Stats = calculateStats(queryFts5Times);
      const likeStats = calculateStats(queryLikeTimes);
      
      console.log(`     FTS5: ${fts5Stats.mean}ms avg (±${fts5Stats.stdDev}ms)`);
      console.log(`     LIKE: ${likeStats.mean}ms avg (±${likeStats.stdDev}ms)`);
      
      if (fts5Stats.mean < likeStats.mean) {
        const speedup = (likeStats.mean / fts5Stats.mean).toFixed(1);
        console.log(`     ✅ FTS5 wins by ${speedup}x`);
      } else {
        const speedup = (fts5Stats.mean / likeStats.mean).toFixed(1);
        console.log(`     ❌ LIKE wins by ${speedup}x`);
      }
      
      fts5Times.push(...queryFts5Times);
      likeTimes.push(...queryLikeTimes);
    }
    
    // Category summary
    const categoryFts5Stats = calculateStats(fts5Times);
    const categoryLikeStats = calculateStats(likeTimes);
    
    console.log(`\n📊 ${categoryData.name} Summary:`);
    console.log(`   FTS5: ${categoryFts5Stats.mean}ms avg, ${fts5TotalResults} total results`);
    console.log(`   LIKE: ${categoryLikeStats.mean}ms avg, ${likeTotalResults} total results`);
    console.log(`   Errors: FTS5=${fts5Errors}, LIKE=${likeErrors}`);
    
    const winner = categoryFts5Stats.mean < categoryLikeStats.mean ? 'FTS5' : 'LIKE';
    const speedup = categoryFts5Stats.mean < categoryLikeStats.mean 
      ? (categoryLikeStats.mean / categoryFts5Stats.mean).toFixed(1)
      : (categoryFts5Stats.mean / categoryLikeStats.mean).toFixed(1);
    
    console.log(`   🏆 Winner: ${winner} (${speedup}x faster)`);
    
    if (winner === categoryData.expectedWinner) {
      console.log(`   ✅ Result matches expectation`);
    } else {
      console.log(`   ❌ Unexpected result - expected ${categoryData.expectedWinner}`);
    }
    
    categoryResults.push({
      category: categoryData.name,
      expected: categoryData.expectedWinner,
      actual: winner,
      speedup: parseFloat(speedup),
      fts5Stats: categoryFts5Stats,
      likeStats: categoryLikeStats,
      errors: { fts5: fts5Errors, like: likeErrors }
    });
  }
  
  // Overall summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 PURE FTS5 vs LIKE PERFORMANCE SUMMARY");
  console.log("=".repeat(80));
  
  let fts5Wins = 0;
  let likeWins = 0;
  let correctPredictions = 0;
  
  categoryResults.forEach(result => {
    const icon = result.actual === 'FTS5' ? '🚀' : '🐌';
    const statusIcon = result.actual === result.expected ? '✅' : '❌';
    
    console.log(`${icon} ${result.category.padEnd(20)} | ${result.actual} wins by ${result.speedup}x | ${statusIcon}`);
    
    if (result.actual === 'FTS5') fts5Wins++;
    else likeWins++;
    
    if (result.actual === result.expected) correctPredictions++;
  });
  
  const totalCategories = categoryResults.length;
  
  console.log(`\n💡 Key Findings:`);
  console.log(`   • FTS5 won: ${fts5Wins}/${totalCategories} categories (${(fts5Wins/totalCategories*100).toFixed(1)}%)`);
  console.log(`   • LIKE won: ${likeWins}/${totalCategories} categories (${(likeWins/totalCategories*100).toFixed(1)}%)`);
  console.log(`   • Prediction accuracy: ${(correctPredictions/totalCategories*100).toFixed(1)}%`);
  
  if (fts5Wins > likeWins) {
    console.log(`\n🚀 RECOMMENDATION: FTS5-First approach is justified`);
    console.log(`   Remove conservative fallback logic to unlock FTS5 performance`);
  } else {
    console.log(`\n🐌 RECOMMENDATION: Current hybrid approach is optimal`); 
    console.log(`   Conservative fallbacks are protecting performance`);
  }
  
  return categoryResults;
};

// Execute the pure performance test
runPurePerformanceTest().catch(console.error);