# FTS5 Performance Optimization Plan
**Status: PHASE 1 & 2 & 3 COMPLETE ✅ | PHASE 4 IN PROGRESS 🔄**

---

## ✅ COMPLETED OPTIMIZATIONS (PHASES 1-3)

### 🚀 **Phase 1: FTS5 Structure Optimization (COMPLETED)**
- **✅ Database restructuring**: 27,550 → 4,861 rows (82% reduction)
- **✅ Eliminated 5.6x duplication** 
- **✅ Optimized FTS5 table structures** for courses, professors, departments

### 🎯 **Phase 2: Query Optimization (COMPLETED)**
- **✅ Added JOINs** for direct grade data inclusion
- **✅ Eliminated separate enhancement queries**
- **✅ Raw FTS5 queries**: ~9ms performance

### 🔧 **Phase 3: Context-Aware Search Logic (COMPLETED)**
- **✅ Fixed course-specific professor search**: "CS 1331" only shows CS 1331 instructors
- **✅ Added result limits**: 7 max per category
- **✅ Context-aware logic**: Different behavior for "CS" vs "CS 1331"
- **✅ Letter suffix support**: CHEM1211K, ECE2020L formats work
- **✅ Fixed database column bug**: Mark Moss student count issue resolved
- **✅ Comprehensive course code patterns**: Universal pattern system implemented

---

## 🚨 PHASE 4: WEIGHTED SEARCH RELEVANCE (IN PROGRESS)

### **Current Problem: Search Result Priority**

**Issue Discovered:**
- **"mark" search** returns marketing courses first, then instructors
- **Course titles match** but have lower relevance than instructor names
- **Need weighted category priority**: Instructor names > Department codes > Course codes > Course titles

### **Root Cause Analysis:**
```sql
-- CURRENT: Separate queries with equal weight
Courses: bm25(courses_fts) = -5.36 (marketing courses)
Instructors: bm25(professors_fts) = -10.06 (Mark professors) -- Better score!

-- PROBLEM: UI shows courses first despite worse relevance
-- SOLUTION: Implement category-based weighting system
```

### **Performance & Relevance Status:**
- **✅ Raw FTS5 queries**: ~9ms (excellent)
- **✅ Course-specific search**: Works correctly  
- **✅ Department filtering**: MATH returns only MATH courses
- **❌ Category prioritization**: Instructor names should rank higher
- **❌ Marketing vs Mark**: Course titles outrank instructor names in UI

---

## 🎯 WEIGHTED SEARCH STRATEGY

### **Category Priority Ranking:**
1. **Instructor names** (highest) - Weight: 10.0
2. **Department codes** - Weight: 5.0  
3. **Course codes** - Weight: 3.0
4. **Course titles** (lowest) - Weight: 1.0

### **Implementation Plan:**
```sql
-- Enhanced relevance scoring with category weights
SELECT *, (ABS(bm25(professors_fts)) * 10.0) as weighted_score
FROM professors_fts WHERE professors_fts MATCH 'mark*'
ORDER BY weighted_score DESC

-- Course scoring with field-specific weights  
SELECT *, 
  CASE 
    WHEN course_code LIKE 'MARK%' THEN (ABS(bm25(courses_fts)) * 3.0)
    ELSE (ABS(bm25(courses_fts)) * 1.0)
  END as weighted_score
FROM courses_fts WHERE courses_fts MATCH 'mark*'
```

---

## 📋 IMPLEMENTATION CHECKLIST

### **Completed ✅**
- [x] **Phase 1-2**: FTS5 structure and query optimization
- [x] **Context-aware search**: Course-specific vs department search  
- [x] **Result limits**: 7 max per category
- [x] **Course code patterns**: Universal pattern system
- [x] **Database fixes**: Column name mismatches resolved
- [x] **Letter suffix support**: K, L, P suffixes working

### **Current Task 🔄**
- [ ] **Weighted search relevance**: Implement category-based scoring
- [ ] **Unified result ranking**: Global weighted sort
- [ ] **UI priority**: Ensure instructors appear first for name searches

### **Success Criteria Progress:**
- [x] **Data**: No duplicate courses in search results  
- [x] **Accuracy**: All courses searchable and findable
- [x] **Context**: "CS 1331" vs "CS" return different results
- [x] **Performance**: Raw queries ~9ms 
- [ ] **Relevance**: "mark" should show instructors first (not marketing)
- [ ] **Priority**: Category-based result weighting

---

## 🎯 CURRENT STATUS

### **Completed Goals:**
- **✅ Search logic**: Context-aware, course-specific filtering
- **✅ Database optimization**: 82% reduction, zero duplicates
- **✅ Pattern recognition**: Comprehensive course code system
- **✅ Bug fixes**: Mark Moss aggregation, column naming

### **Final Goal:**
- **🎯 Weighted relevance**: Category priority (instructor > course title)
- **🎯 Smart ranking**: "mark" → Mark professors first, marketing courses second

### **Next Step:**
**Implement weighted search relevance system to prioritize instructor names over course titles.**

**Current Status: 85% complete, ready for weighted relevance implementation!**