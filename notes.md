The problem is clear now! The queries are using bm25(courses_fts) in a
   context where they're joining with other tables. The BM25 function
  must be used in the SELECT clause of the FTS5 table directly, not in
  joined queries. Let me fix this by updating both the FTS5 setup and
  the query logic: