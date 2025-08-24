import { Collapse, Heading, Spinner, VStack } from "@chakra-ui/react";
import React from "react";
import Card from "../Card";
import { AverageGradeTag, MostCommonGradeTag } from "./SearchResultTags";
import { searchDurations } from "../../lib/config";

// Helper function to parse course code (e.g., "CS 1301" -> { subject: "CS", number: 1301 })
const parseCourseCode = (className) => {
  const match = className.match(/^([A-Za-z]+)\s*(\d+)/);
  if (match) {
    return {
      subject: match[1].toUpperCase(),
      number: parseInt(match[2], 10),
    };
  }
  return { subject: className, number: 0 };
};

// Helper function to detect if search term is likely a person's name
const isLikelyName = (term, searchResults) => {
  const cleaned = term?.trim().toLowerCase();
  if (!cleaned) return false;
  
  // Must have professor results to be name search
  if (!searchResults?.data?.professors?.length) return false;
  
  // Pattern: 2-15 chars, letters/spaces only
  if (!cleaned.match(/^[a-z\s]{2,15}$/i)) return false;
  
  // Exclude obvious academic terms
  const academicTerms = ['algorithms', 'calculus', 'physics', 'chemistry', 
                        'biology', 'programming', 'mathematics', 'statistics',
                        'linear', 'discrete', 'organic', 'general'];
  if (academicTerms.includes(cleaned)) return false;
  
  return true;
};

// Helper function to determine optimal component ordering based on search context
const getComponentOrder = (searchResults, searchTerm) => {
  // Name search: Show professors first
  if (isLikelyName(searchTerm, searchResults)) {
    return [Professors, Classes, Departments];
  }
  
  // Default: Current ordering for course/content searches
  return [Classes, Professors, Departments];
};

// Sort courses by relevance score first, then maintain numerical ordering
const sortCourses = (courses) => {
  return courses.sort((a, b) => {
    const courseA = parseCourseCode(a.class_name);
    const courseB = parseCourseCode(b.class_name);

    // Primary sort: relevance score (includes student count factor)
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }

    // Secondary sort: subject alphabetically
    if (courseA.subject !== courseB.subject) {
      return courseA.subject.localeCompare(courseB.subject);
    }

    // Tertiary sort: course number numerically
    return courseA.number - courseB.number;
  });
};

const Classes = ({ searchResults, onClick }) => {
  if (
    searchResults === null ||
    !searchResults.success ||
    searchResults.data.classes?.length === 0
  ) {
    return null;
  }

  return (
    <VStack spacing={2} width={"100%"} align={"start"}>
      <Heading size={"md"} pt={4}>
        Classes
      </Heading>
      {sortCourses(searchResults.data.classes).map((row) => {
        const classCode = row.class_name.replace(/ /g, "");
        return (
          <Card
            key={row.class_name}
            href={`/class/${classCode}`}
            onClick={onClick}
            spinnerTop={"34.5px"}
            rightContent={[
              row.averageGPA > 0 && (
                <AverageGradeTag key={"avg"} gpa={row.averageGPA.toFixed(2)} />
              ),
              row.mostStudents && (
                <MostCommonGradeTag
                  key={"common"}
                  grade={row.mostStudents}
                  percentage={row.mostStudentsPercent.toFixed(1)}
                />
              ),
            ].filter(Boolean)}
          >
            {row.class_name} - {row.class_desc}
          </Card>
        );
      })}
    </VStack>
  );
};

const Departments = ({ searchResults, onClick }) => {
  if (
    searchResults === null ||
    !searchResults.success ||
    searchResults.data.departments?.length === 0
  ) {
    return null;
  }

  return (
    <VStack spacing={2} width={"100%"} align={"start"}>
      <Heading size={"md"} pt={4}>
        Departments
      </Heading>
      {searchResults.data.departments.map((row) => (
        <Card
          key={`${row.campus}_${row.dept_abbr}`}
          href={`/dept/${row.dept_abbr}`}
          onClick={onClick}
          spinnerTop={"34.5px"}
          rightContent={[
            row.averageGPA > 0 && (
              <AverageGradeTag key={"avg"} gpa={row.averageGPA.toFixed(2)} />
            ),
            row.mostStudents && (
              <MostCommonGradeTag
                key={"common"}
                grade={row.mostStudents}
                percentage={row.mostStudentsPercent.toFixed(1)}
              />
            ),
          ].filter(Boolean)}
        >
          {row.dept_abbr} - {row.dept_name}
        </Card>
      ))}
    </VStack>
  );
};

const Professors = ({ searchResults, onClick }) => {
  if (
    searchResults === null ||
    !searchResults.success ||
    searchResults.data.professors?.length === 0
  ) {
    return null;
  }

  return (
    <VStack spacing={2} width={"100%"} align={"start"}>
      <Heading size={"md"} pt={4}>
        Instructors
      </Heading>
      {searchResults.data.professors.map((row) => (
        <Card
          key={row.id}
          href={`/inst/${row.id}`}
          onClick={onClick}
          spinnerTop={"34.5px"}
          rightContent={[
            row.averageGPA > 0 && (
              <AverageGradeTag key={"avg"} gpa={row.averageGPA.toFixed(2)} />
            ),
            row.mostStudents && (
              <MostCommonGradeTag
                key={"common"}
                grade={row.mostStudents}
                percentage={row.mostStudentsPercent.toFixed(1)}
              />
            ),
          ].filter(Boolean)}
        >
          {row.name}
        </Card>
      ))}
    </VStack>
  );
};

export default function SearchResults({
  searchResults,
  pageShown: [showPage, setShowPage],
  search,
}) {
  const clickHandler = () => {
    setShowPage(true);
  };
  return (
    <Collapse
      in={!showPage}
      transition={{
        exit: { duration: searchDurations.enter },
        enter: {
          duration: (3 * searchDurations.exit) / 4,
          delay: searchDurations.exit / 8,
        },
      }}
      width={"100%"}
    >
      <VStack
        spacing={4}
        width={"100%"}
        align={"start"}
        px={2}
        pt={2}
        pb={16}
        minH={"75vh"}
      >
        {/* <Heading pt={4}>
          Search Results for &ldquo;{search.trim()}&rdquo;
        </Heading> */}
        {/* no results box: */}
        {searchResults !== null &&
          searchResults.data.classes.length +
            searchResults.data.professors.length +
            searchResults.data.departments.length ===
            0 && (
            <Heading size={"md"} pt={4}>
              No results found.
            </Heading>
          )}
        {/* Loading indicator: */}
        {searchResults === null && (
          <Heading size={"md"} pt={4}>
            <Spinner size={"sm"} mr={2} />
            Loading...
          </Heading>
        )}
        {getComponentOrder(searchResults, search).map((Component, index) => (
          <Component 
            key={Component.name || index}
            searchResults={searchResults} 
            onClick={clickHandler} 
          />
        ))}
      </VStack>
    </Collapse>
  );
}
