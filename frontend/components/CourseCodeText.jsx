import React, { useState, useEffect } from "react";
import { Link as ChakraLink, Text, Tag, Tooltip } from "@chakra-ui/react";
import NextLink from "next/link";
import { parseCourseCodesInText } from "../lib/db/utils.js";

// Module-level LRU cache for course metadata (shared util)
import { LRUCache } from "../utils/LRUCache";
const metadataCache = new LRUCache(100, 60 * 60 * 1000); // 100 items, 1 hour TTL

const CourseChip = ({ match, onCourseCodeClick, resolvedMeta }) => {
  // Use resolved metadata if available (from batch fetch or SSR)
  const courseExists = resolvedMeta ? resolvedMeta.exists : true;
  const courseTitle = resolvedMeta ? resolvedMeta.title : null;

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
          prefetch={false}
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

const CourseCodeText = ({ children, fontSize = "sm", onCourseCodeClick, resolvedCourses = null, ...textProps }) => {
  const [courseMetadata, setCourseMetadata] = useState(resolvedCourses || {});

  if (!children || typeof children !== "string") {
    return <Text fontSize={fontSize} {...textProps}>{children}</Text>;
  }

  const courseMatches = parseCourseCodesInText(children);
  
  if (courseMatches.length === 0) {
    return <Text fontSize={fontSize} {...textProps}>{children}</Text>;
  }

  // Extract unique course codes
  const uniqueCodes = [...new Set(courseMatches.map(match => match.classCode))];

  useEffect(() => {
    // No codes to resolve
    if (uniqueCodes.length === 0) {
      return;
    }

    const fetchBatchMetadata = async () => {
      // Seed with SSR-provided results if any
      const seededResults = { ...(resolvedCourses || {}) };
      // Populate module-level cache with SSR results to benefit other instances
      for (const [code, meta] of Object.entries(seededResults)) {
        metadataCache.set(code, meta);
      }

      const cachedResults = { ...seededResults };
      const codesNeedingFetch = [];

      for (const code of uniqueCodes) {
        // Prefer SSR-provided first
        if (seededResults[code]) {
          continue;
        }

        const cached = metadataCache.get(code);
        if (cached) {
          cachedResults[code] = cached;
        } else {
          codesNeedingFetch.push(code);
        }
      }

      // If everything is covered by SSR/cache, update state and stop
      if (codesNeedingFetch.length === 0) {
        setCourseMetadata(cachedResults);
        return;
      }

      try {
        // Fetch missing codes in batch
        const query = codesNeedingFetch.map((c) => encodeURIComponent(c)).join(',');
        const response = await fetch(`/api/class/meta?codes=${query}`);
        
        if (response.ok) {
          const data = await response.json();
          const fetchedResults = data.data || {};
          
          // Cache the results
          for (const [code, meta] of Object.entries(fetchedResults)) {
            metadataCache.set(code, meta);
          }
          
          // Merge seeded, cached, and fetched results
          setCourseMetadata({ ...cachedResults, ...fetchedResults });
        } else {
          console.error('Failed to fetch course metadata:', response.status);
          // Use what we have
          setCourseMetadata(cachedResults);
        }
      } catch (error) {
        console.error('Error fetching course metadata:', error);
        setCourseMetadata(cachedResults);
      }
    };

    fetchBatchMetadata();
  }, [uniqueCodes.join(','), Object.keys(resolvedCourses || {}).join(',')]);

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
        resolvedMeta={courseMetadata[match.classCode]}
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