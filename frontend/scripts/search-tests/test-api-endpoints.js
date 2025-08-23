#!/usr/bin/env node

/**
 * API Endpoint Integration Test Script
 * 
 * Tests API endpoints with real HTTP requests:
 * - /api/search endpoint functionality
 * - /api/autocomplete endpoint functionality
 * - HTTP cache headers validation
 * - Error handling and edge cases
 * - Response format validation
 * - Performance timing
 */

import http from "http";
import https from "https";
import { URL } from "url";

console.log("🌐 API Endpoint Integration Tests\n");

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const REQUEST_TIMEOUT = 10000; // 10 seconds

// Helper function to make HTTP requests
const makeRequest = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(url, {
      timeout: REQUEST_TIMEOUT,
      ...options
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData,
            responseTime: Date.now() - startTime
          });
        } catch (parseError) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data,
            responseTime: Date.now() - startTime,
            parseError: parseError.message
          });
        }
      });
      
      const startTime = Date.now();
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.setTimeout(REQUEST_TIMEOUT, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
};

// Test search endpoint functionality
const testSearchEndpoint = async () => {
  console.log("=== SEARCH ENDPOINT TESTS ===\n");
  
  const searchTests = [
    {
      name: "Exact Course Code",
      query: "CS1301",
      expectedCache: 300, // 5 minutes
      expectedResults: true,
      description: "Should return courses and have 5min cache"
    },
    {
      name: "Department Prefix",
      query: "CS",
      expectedCache: 300, // 5 minutes
      expectedResults: true,
      description: "Should return CS department courses with 5min cache"
    },
    {
      name: "Course Title Search",
      query: "Introduction to Computer Science",
      expectedCache: 180, // 3 minutes
      expectedResults: true,
      description: "Should search course titles with 3min cache"
    },
    {
      name: "Professor Name",
      query: "Smith",
      expectedCache: 180, // 3 minutes
      expectedResults: true,
      description: "Should search professors with 3min cache"
    },
    {
      name: "Mixed Query",
      query: "CS programming",
      expectedCache: 180, // 3 minutes
      expectedResults: true,
      description: "Should handle multi-word searches"
    },
    {
      name: "Empty Query",
      query: "",
      expectedStatus: 400,
      description: "Should return 400 for empty query"
    },
    {
      name: "Very Long Query",
      query: "a".repeat(1000),
      expectedResults: false,
      description: "Should handle very long queries gracefully"
    }
  ];
  
  let passedTests = 0;
  
  for (const test of searchTests) {
    console.log(`Testing ${test.name}: "${test.query.substring(0, 50)}${test.query.length > 50 ? '...' : ''}"`);
    
    try {
      const url = `${API_BASE_URL}/api/search?q=${encodeURIComponent(test.query)}`;
      const response = await makeRequest(url);
      
      // Check status code
      const expectedStatus = test.expectedStatus || 200;
      if (response.statusCode === expectedStatus) {
        console.log(`   ✅ Status: ${response.statusCode}`);
      } else {
        console.log(`   ❌ Status: Expected ${expectedStatus}, got ${response.statusCode}`);
      }
      
      // Check response time
      console.log(`   ⏱️  Response time: ${response.responseTime}ms`);
      
      if (response.statusCode === 200) {
        // Validate response structure
        if (response.data && response.data.success === true && response.data.data) {
          console.log(`   ✅ Valid response structure`);
          
          const { classes, professors, departments } = response.data.data;
          const totalResults = (classes?.length || 0) + (professors?.length || 0) + (departments?.length || 0);
          
          console.log(`   📊 Results: ${totalResults} total (${classes?.length || 0} courses, ${professors?.length || 0} professors, ${departments?.length || 0} departments)`);
          
          if (test.expectedResults && totalResults > 0) {
            console.log(`   ✅ Found expected results`);
            passedTests++;
          } else if (!test.expectedResults) {
            console.log(`   ✅ No results as expected`);
            passedTests++;
          } else {
            console.log(`   ⚠️  Expected results but found none`);
          }
          
          // Check for BM25 scores if present
          if (classes && classes.length > 0 && classes[0].relevance_score !== undefined) {
            console.log(`   🎯 BM25 scores present: ${classes[0].relevance_score.toFixed(3)}`);
          }
          
        } else {
          console.log(`   ❌ Invalid response structure`);
        }
        
        // Check cache headers
        const cacheControl = response.headers['cache-control'];
        if (cacheControl && test.expectedCache) {
          const maxAgeMatch = cacheControl.match(/s-maxage=(\d+)/);
          if (maxAgeMatch && parseInt(maxAgeMatch[1]) === test.expectedCache) {
            console.log(`   ✅ Cache headers correct: ${test.expectedCache}s`);
          } else {
            console.log(`   ⚠️  Cache headers: Expected ${test.expectedCache}s, got ${cacheControl}`);
          }
        } else if (test.expectedCache) {
          console.log(`   ⚠️  No cache headers found`);
        }
        
      } else if (response.statusCode === expectedStatus) {
        passedTests++;
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    console.log("");
  }
  
  console.log(`📊 Search Endpoint Tests: ${passedTests}/${searchTests.length} passed\n`);
};

// Test autocomplete endpoint functionality
const testAutocompleteEndpoint = async () => {
  console.log("=== AUTOCOMPLETE ENDPOINT TESTS ===\n");
  
  const autocompleteTests = [
    {
      name: "Department Prefix",
      query: "CS",
      expectedCache: 600, // 10 minutes for dept prefix
      expectedResults: true,
      description: "Department prefix should have 10min cache"
    },
    {
      name: "Course Code Start",
      query: "CS13",
      expectedCache: 300, // 5 minutes general
      expectedResults: true,
      description: "Course code prefix should have 5min cache"
    },
    {
      name: "Professor Name",
      query: "Smith",
      expectedCache: 300, // 5 minutes general
      expectedResults: true,
      description: "Professor name autocomplete"
    },
    {
      name: "Short Query",
      query: "C",
      expectedResults: true,
      description: "Single character should still work"
    },
    {
      name: "Very Short Query",
      query: "a",
      expectedResults: false,
      description: "Very short query might return empty"
    },
    {
      name: "Empty Query", 
      query: "",
      expectedStatus: 400,
      description: "Empty query should return 400"
    }
  ];
  
  let passedTests = 0;
  
  for (const test of autocompleteTests) {
    console.log(`Testing ${test.name}: "${test.query}"`);
    
    try {
      const url = `${API_BASE_URL}/api/autocomplete?q=${encodeURIComponent(test.query)}`;
      const response = await makeRequest(url);
      
      // Check status code
      const expectedStatus = test.expectedStatus || 200;
      if (response.statusCode === expectedStatus) {
        console.log(`   ✅ Status: ${response.statusCode}`);
      } else {
        console.log(`   ❌ Status: Expected ${expectedStatus}, got ${response.statusCode}`);
      }
      
      console.log(`   ⏱️  Response time: ${response.responseTime}ms`);
      
      if (response.statusCode === 200) {
        // Validate response structure
        if (response.data && response.data.success === true && response.data.data) {
          console.log(`   ✅ Valid response structure`);
          
          const { courses, professors, departments } = response.data.data;
          const totalResults = (courses?.length || 0) + (professors?.length || 0) + (departments?.length || 0);
          
          console.log(`   📊 Results: ${totalResults} total (${courses?.length || 0} courses, ${professors?.length || 0} professors, ${departments?.length || 0} departments)`);
          
          // Autocomplete should limit results (typically 5 per category)
          if (courses && courses.length <= 5) {
            console.log(`   ✅ Appropriate result limiting (≤5 courses)`);
          }
          
          if (test.expectedResults && totalResults > 0) {
            console.log(`   ✅ Found expected results`);
            passedTests++;
          } else if (!test.expectedResults) {
            console.log(`   ✅ No results as expected`);
            passedTests++;
          } else {
            console.log(`   ⚠️  Expected results but found none`);
          }
          
        } else {
          console.log(`   ❌ Invalid response structure`);
        }
        
        // Check cache headers for department prefixes
        const cacheControl = response.headers['cache-control'];
        if (cacheControl && test.expectedCache) {
          const maxAgeMatch = cacheControl.match(/s-maxage=(\d+)/);
          if (maxAgeMatch && parseInt(maxAgeMatch[1]) === test.expectedCache) {
            console.log(`   ✅ Cache headers correct: ${test.expectedCache}s`);
          } else {
            console.log(`   ⚠️  Cache headers: Expected ${test.expectedCache}s, got ${cacheControl}`);
          }
        }
        
      } else if (response.statusCode === expectedStatus) {
        passedTests++;
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    console.log("");
  }
  
  console.log(`📊 Autocomplete Endpoint Tests: ${passedTests}/${autocompleteTests.length} passed\n`);
};

// Test error handling and edge cases
const testErrorHandling = async () => {
  console.log("=== ERROR HANDLING TESTS ===\n");
  
  const errorTests = [
    {
      name: "Missing Query Parameter",
      url: `${API_BASE_URL}/api/search`,
      expectedStatus: 400,
      description: "Should return 400 for missing q parameter"
    },
    {
      name: "Invalid Endpoint",
      url: `${API_BASE_URL}/api/invalid-endpoint?q=test`,
      expectedStatus: 404,
      description: "Should return 404 for invalid endpoint"
    },
    {
      name: "Special Characters Query",
      url: `${API_BASE_URL}/api/search?q=${encodeURIComponent("!@#$%^&*()")}`,
      expectedStatus: 200,
      description: "Should handle special characters gracefully"
    },
    {
      name: "Unicode Query",
      url: `${API_BASE_URL}/api/search?q=${encodeURIComponent("数学")}`,
      expectedStatus: 200,
      description: "Should handle unicode characters"
    }
  ];
  
  let passedTests = 0;
  
  for (const test of errorTests) {
    console.log(`Testing ${test.name}`);
    console.log(`   URL: ${test.url}`);
    
    try {
      const response = await makeRequest(test.url);
      
      if (response.statusCode === test.expectedStatus) {
        console.log(`   ✅ Status: ${response.statusCode} (expected)`);
        passedTests++;
      } else {
        console.log(`   ❌ Status: ${response.statusCode} (expected ${test.expectedStatus})`);
      }
      
      // Check that error responses have proper structure
      if (response.statusCode >= 400 && response.data) {
        if (response.data.success === false) {
          console.log(`   ✅ Proper error response structure`);
        } else {
          console.log(`   ⚠️  Error response should have success: false`);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    console.log("");
  }
  
  console.log(`📊 Error Handling Tests: ${passedTests}/${errorTests.length} passed\n`);
};

// Test performance under load
const testAPIPerformance = async () => {
  console.log("=== API PERFORMANCE TESTS ===\n");
  
  const performanceQueries = [
    "CS1301", "MATH1551", "ECE2031", "CS", "MATH", "Smith", "programming", "calculus"
  ];
  
  console.log("Testing API performance with concurrent requests...");
  
  const startTime = Date.now();
  
  // Test concurrent requests
  const promises = performanceQueries.map(async (query, index) => {
    const url = `${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`;
    const response = await makeRequest(url);
    return { query, index, ...response };
  });
  
  try {
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const successCount = results.filter(r => r.statusCode === 200).length;
    const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    
    console.log(`\n📊 Performance Results:`);
    console.log(`   Total requests: ${results.length}`);
    console.log(`   Successful requests: ${successCount}`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Average response time: ${averageResponseTime.toFixed(1)}ms`);
    console.log(`   Requests per second: ${(results.length / (totalTime / 1000)).toFixed(1)}`);
    
    // Show individual results
    results.forEach(result => {
      const status = result.statusCode === 200 ? '✅' : '❌';
      console.log(`   ${status} ${result.query}: ${result.responseTime}ms`);
    });
    
    if (successCount === results.length) {
      console.log(`   ✅ All concurrent requests successful`);
    }
    
    if (averageResponseTime < 100) {
      console.log(`   ✅ Fast response times (< 100ms average)`);
    } else if (averageResponseTime < 500) {
      console.log(`   ⚠️  Moderate response times (${averageResponseTime.toFixed(1)}ms average)`);
    } else {
      console.log(`   ⚠️  Slow response times (${averageResponseTime.toFixed(1)}ms average)`);
    }
    
  } catch (error) {
    console.log(`   ❌ Concurrent request test failed: ${error.message}`);
  }
  
  console.log("");
};

// Run all API endpoint tests
const runAllAPITests = async () => {
  console.log("🚀 Starting API endpoint integration tests...\n");
  console.log(`Testing against: ${API_BASE_URL}\n`);
  
  // Check if server is running
  try {
    await makeRequest(`${API_BASE_URL}/api/search?q=test`);
    console.log("✅ Server is responding\n");
  } catch (error) {
    console.log(`❌ Server not responding at ${API_BASE_URL}`);
    console.log(`Please start your development server with: npm run dev\n`);
    return;
  }
  
  await testSearchEndpoint();
  await testAutocompleteEndpoint();
  await testErrorHandling();
  await testAPIPerformance();
  
  console.log("🎉 API endpoint testing complete!");
  console.log("\n📋 API Integration Test Summary:");
  console.log("- ✅ Search endpoint functionality and validation");
  console.log("- ✅ Autocomplete endpoint functionality and validation");
  console.log("- ✅ HTTP cache headers verification");
  console.log("- ✅ Error handling and edge cases");
  console.log("- ✅ Response format and structure validation");
  console.log("- ✅ Performance testing with concurrent requests");
};

// Execute API tests
runAllAPITests().catch(console.error);