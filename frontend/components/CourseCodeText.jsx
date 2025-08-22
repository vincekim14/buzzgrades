import React, { useState, useEffect } from "react";
import { Link as ChakraLink, Text, Tag, Tooltip } from "@chakra-ui/react";
import NextLink from "next/link";

const parseCourseCodesInText = (text) => {
  if (!text) return [];
  
  // Regex to match course codes like "ACCT 2101" or "MATH 1501"
  const courseCodeRegex = /([A-Z]{2,4})\s+(\d{4}[A-Z]?)/g;
  const matches = [];
  let match;
  
  while ((match = courseCodeRegex.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      deptCode: match[1],
      courseNumber: match[2],
      classCode: `${match[1]}${match[2]}`, // For URL
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  return matches;
};

const CourseChip = ({ match, onCourseCodeClick }) => {
  const [courseTitle, setCourseTitle] = useState(null);
  const [courseExists, setCourseExists] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCourseInfo = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/class/${match.classCode}`);
        if (response.ok) {
          const data = await response.json();
          const title = data.data?.oscarTitle || data.data?.class_desc;
          setCourseTitle(title?.trim());
          setCourseExists(true);
        } else if (response.status === 404) {
          setCourseExists(false);
        }
      } catch (error) {
        console.error("Failed to fetch course info:", error);
        setCourseExists(false);
      } finally {
        setLoading(false);
      }
    };

    fetchCourseInfo();
  }, [match.classCode]);

  const tooltipLabel = courseTitle
    ? `${match.fullMatch} — ${courseTitle}`
    : match.fullMatch;

  const tagContent = (
    <Tag
      size="sm"
      cursor="pointer"
      px={1.5}
      py={0}
      border="1px solid"
      borderColor="#003057"
      color="#003057"
      bg="transparent"
      _hover={{
        bg: "#003057",
        color: "white"
      }}
    >
      {match.fullMatch}
    </Tag>
  );

  return (
    <Tooltip
      label={tooltipLabel}
      hasArrow
      placement="top"
      openDelay={300}
      fontSize="sm"
      textAlign="center"
      whiteSpace="normal"
    >
      {courseExists ? (
        <ChakraLink
          as={NextLink}
          href={`/class/${match.classCode}`}
          textDecoration="none"
          _hover={{
            textDecoration: "none"
          }}
          display="inline-block"
          mx={0.5}
          onClick={onCourseCodeClick}
        >
          {tagContent}
        </ChakraLink>
      ) : (
        <span style={{ display: "inline-block", margin: "0 2px" }}>
          {tagContent}
        </span>
      )}
    </Tooltip>
  );
};

const CourseCodeText = ({ children, fontSize = "sm", onCourseCodeClick, ...textProps }) => {
  if (!children || typeof children !== "string") {
    return <Text fontSize={fontSize} {...textProps}>{children}</Text>;
  }

  const courseMatches = parseCourseCodesInText(children);
  
  if (courseMatches.length === 0) {
    return <Text fontSize={fontSize} {...textProps}>{children}</Text>;
  }

  const elements = [];
  let lastIndex = 0;

  courseMatches.forEach((match, index) => {
    // Add text before this match
    if (match.startIndex > lastIndex) {
      elements.push(
        <span key={`text-${index}`}>
          {children.substring(lastIndex, match.startIndex)}
        </span>
      );
    }

    // Add the clickable course code as a chip with tooltip
    elements.push(
      <CourseChip
        key={`link-${index}`}
        match={match}
        onCourseCodeClick={onCourseCodeClick}
      />
    );

    lastIndex = match.endIndex;
  });

  // Add remaining text after the last match
  if (lastIndex < children.length) {
    elements.push(
      <span key="text-final">
        {children.substring(lastIndex)}
      </span>
    );
  }

  return (
    <Text fontSize={fontSize} {...textProps}>
      {elements}
    </Text>
  );
};

export default CourseCodeText;