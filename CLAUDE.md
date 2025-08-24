## BuzzGrades Remediation Plan: Search, DB Layer, and UI Consistency

### Why this document
This is a step-by-step, implementation-ready plan to fix critical inconsistencies and dead code around the search/DB layer. It includes exact files to change, the concrete edits to make, and acceptance criteria. You can give this directly to an LLM to execute.

---

## High-priority issues to fix (in order)
- Ambiguous DB import target causes drift and inconsistent behavior across pages.
- Legacy `frontend/lib/db.js` includes an FTS5 routine that does not match the actual FTS5 schema and must not be used.
- Naming inconsistency between DB outputs and UI expectations (professor_id vs instructor_id).
- Unused/duplicative code increases maintenance and risk.

---

## 1) Consolidate DB imports to the modular API and remove legacy DB file

### Problem
- Many files import `../../lib/db`, which resolves to `frontend/lib/db.js` (monolithic legacy) instead of the intended modular `frontend/lib/db/index.js`. Node’s resolution prefers a file over a directory with `index.js` when both exist.
- The legacy `frontend/lib/db.js` contains its own FTS5 implementation that references columns not present in our actual FTS5 schema (see Section 2). Keeping it creates risk of regressions.

### Goal
- All server routes/pages should import from `frontend/lib/db/index.js`.
- Remove `frontend/lib/db.js` once consumers are updated (or neuter it to re-export the modular API during a transition).

### Edits
1) Change all imports that currently read `from "../../lib/db"` (or similar) to explicitly import the modular index:
   - Files to update:
     - `frontend/pages/class/[classCode].jsx`
     - `frontend/pages/inst/[profCode].jsx`
     - `frontend/pages/dept/[deptCode].jsx`
     - `frontend/pages/api/class/[classCode].js`
     - `frontend/pages/api/dept/[deptCode].js`
     - `frontend/pages/api/prof/[profCode].js`
     - `frontend/pages/sitemap_full.xml.js`

   - Replace lines like:
     ```javascript
     import { getClassInfo, getDistribution } from "../../lib/db";
     ```
     with:
     ```javascript
     import { getClassInfo, getDistribution } from "../../lib/db/index.js";
     ```

2) After imports are updated and tests pass, delete the legacy file:
   - Remove `frontend/lib/db.js`.

3) Optional safer transition (if you want a two-step rollout):
   - Temporarily rewrite `frontend/lib/db.js` to re-export the modular API only:
     ```javascript
     export * from "./db/index.js";
     ```
   - Then proceed to delete `frontend/lib/db.js` after all imports have been changed and verified.

### Acceptance criteria
- No remaining imports of `frontend/lib/db.js`.
- All affected pages and API routes build and run locally.
- Search results and class/inst/dept pages render correctly with the modular DB.

---

## 2) Fix FTS5 schema incompatibility (by removing the incompatible code path)

### Problem
- The legacy `frontend/lib/db.js` defines `getSearchFTS5` which selects non-existent columns from `courses_fts` (e.g., `dept_abbr`, `course_num`, `total_students`).
- Actual FTS5 schema (from `frontend/setup_fts5.js`) only has: `course_code`, `course_code_space`, `course_title`, `department`, `class_id` (plus separate professors_fts, departments_fts).

### Goal
- Ensure the only FTS5 implementation used is `frontend/lib/db/fts-search.js` via `frontend/lib/db/index.js`.

### Edits
- Deleting `frontend/lib/db.js` (Section 1) removes the incompatible code path.
- Verify `frontend/pages/api/search.js` imports `getSearchFTS5` from `../../lib/db/index.js` (already correct).

### Acceptance criteria
- No code reads FTS5 columns that do not exist in `courses_fts`.
- The search API returns results consistently and quickly using the modular `fts-search.js` implementation.

---

## 3) Standardize field naming: use `professor_id` everywhere the UI expects it

### Problem
- UI components expect `professor_id` (e.g., `frontend/pages/class/[classCode].jsx` uses `dist.professor_id`).
- `frontend/lib/db/queries.js` returns `instructor_id` in `getDistribution`. This mismatch is currently masked because pages resolve to the legacy `lib/db.js` which aliases `instructor_id AS professor_id`.

### Goal
- Keep UI unchanged; update the modular queries to match the UI shape (`professor_id`).

### Edits
1) In `frontend/lib/db/queries.js`, edit `getDistribution` SELECT list:
   - Change from:
     ```sql
     instructor_id,
     name      as professor_name,
     RMP_score as professor_RMP_score
     ```
   - To:
     ```sql
     d.instructor_id as professor_id,
     name            as professor_name,
     RMP_score       as professor_RMP_score
     ```

2) Update the grouping key after parsing to group by `professor_id`:
   - Change:
     ```javascript
     return summarizeTerms(groupBy(rows.map(row => parseJSONFromRow(row, tryJSONParse)), "instructor_id"));
     ```
   - To:
     ```javascript
     return summarizeTerms(groupBy(rows.map(row => parseJSONFromRow(row, tryJSONParse)), "professor_id"));
     ```

3) Confirm that other query functions’ output shapes still match consumers:
   - `getInstructorInfo`, `getInstructorClasses` can remain as-is (UI reads names/grades via returned structures).

### Acceptance criteria
- `frontend/pages/class/[classCode].jsx` continues to work with `dist.professor_id` when using the modular DB.
- No consumer references `instructor_id` anymore in contexts expecting `professor_id`.

---

## 4) Remove dead code and DRY utilities

### 4a) Remove unused chart component
- File to delete: `frontend/components/Stats/StaticBarChart.jsx`
- Rationale: `frontend/components/Stats/index.jsx` always renders `BarChart`. The static variant is commented and unused.

### 4b) De-duplicate `parseCourseCodesInText`
- Today it exists in two places:
  - `frontend/lib/db/utils.js` (exported function)
  - `frontend/components/CourseCodeText.jsx` (local duplicate)

### Edits
1) In `frontend/components/CourseCodeText.jsx`:
   - Remove the local `parseCourseCodesInText` implementation.
   - Add an import at top:
     ```javascript
     import { parseCourseCodesInText } from "../lib/db/utils.js";
     ```
   - Ensure the relative path is correct from the component location:
     - From `frontend/components/CourseCodeText.jsx` to `frontend/lib/db/utils.js` use:
       ```javascript
       import { parseCourseCodesInText } from "../lib/db/utils.js";
       ```
   - Keep all usages unchanged.

2) Delete `frontend/components/Stats/StaticBarChart.jsx`.

### Acceptance criteria
- Course code chips still render with the same behavior and tooltips.
- No references to `StaticBarChart` remain.

---

## 5) Optional: Improve search result ordering for name-like queries

### Problem
- For queries that look like a person’s name (e.g., "mark"), we want instructors to appear first in the UI.

### Low-risk approach (UI only)
- Keep API responses as-is for speed.
- In `frontend/components/Search/SearchResults.jsx`, a name-like query already reorders components (`Instructors` before `Classes`) via `isLikelyName`. Validate and, if needed, slightly relax or enhance the heuristic (e.g., treat 2–20 character alphabetic terms with professor hits as names).

### Higher-impact approach (API weighting)
- Apply category weighting inside the API to compute a combined score (heavier weight for professors). Only do this if UI-only ordering is insufficient.

### Acceptance criteria
- For name-like inputs, instructors show first in the results.
- Non-name searches keep existing ordering and performance.

---

## 6) Testing and verification

### Commands (from `frontend/`)
- Local search tests:
  - `node test_search.js`
  - `node test_fts5_performance.js`

### Manual checks
- API endpoints:
  - `/api/search?q=CS%201331` returns classes, instructors, and departments without errors.
  - `/api/class/[classCode]`, `/api/dept/[deptCode]`, `/api/prof/[profCode]` return valid payloads.
- UI pages:
  - Class page renders distributions; instructor cards link via `professor_id`.
  - Dept/Inst pages render and load charts.
- Dev-only note: Image routes (`/api/image/...`) fetch production JSON. Local-only runs won’t have that data; that’s expected.

### Build
- `npm run build` or `yarn build` from `frontend/` succeeds.

---

## 7) Rollout and cleanup

### Order of operations
1) Update imports to `frontend/lib/db/index.js` in all consumers (Section 1).
2) Update `frontend/lib/db/queries.js` to emit `professor_id` as described (Section 3).
3) Verify tests and manual checks (Section 6).
4) Delete legacy files:
   - `frontend/lib/db.js`
   - `frontend/components/Stats/StaticBarChart.jsx`
5) DRY up `CourseCodeText.jsx` to use shared util (Section 4b).

### Rollback plan
- If any page breaks after consolidating imports, temporarily restore `frontend/lib/db.js` that re-exports the modular API (see Section 1 step 3). Then fix per-file issues and retry.

---

## Appendix: Quick diffs to apply

### A) Imports (example)
```javascript
// Before
import { getClassInfo, getDistribution } from "../../lib/db";

// After
import { getClassInfo, getDistribution } from "../../lib/db/index.js";
```

### B) queries.js – `getDistribution` SELECT and groupBy
```sql
-- Before (columns excerpt)
instructor_id,
name      as professor_name,
RMP_score as professor_RMP_score

-- After
d.instructor_id as professor_id,
name            as professor_name,
RMP_score       as professor_RMP_score
```

```javascript
// Before
return summarizeTerms(
  groupBy(rows.map(row => parseJSONFromRow(row, tryJSONParse)), "instructor_id")
);

// After
return summarizeTerms(
  groupBy(rows.map(row => parseJSONFromRow(row, tryJSONParse)), "professor_id")
);
```

### C) CourseCodeText.jsx – import shared util
```javascript
// Add at top of file (adjust relative path if needed)
import { parseCourseCodesInText } from "../lib/db/utils.js";

// Then remove the local implementation of parseCourseCodesInText
```

---

## Done criteria (all must be true)
- All pages/routes import from `frontend/lib/db/index.js` with no usage of `frontend/lib/db.js`.
- Modular DB returns field names matching UI expectations (`professor_id`).
- Search API uses only `frontend/lib/db/fts-search.js` and does not query non-existent FTS5 columns.
- Unused component deleted; duplicated util removed.
- Build green; basic manual/API tests pass.