import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Box, VStack } from '@chakra-ui/react';
import { distributionsToCards } from './distributionsToCards';
import { useIntersectionPrefetch } from '../hooks/useIntersectionPrefetch';

const ITEM_HEIGHT = 180; // Approximate height of each course card
const CONTAINER_HEIGHT = 600; // Height of the virtualized container

const VirtualizedCourseList = ({ 
  distributions, 
  isMobile, 
  sortingFunc = "NONE",
  isStatic = false 
}) => {
  // Format distributions for cards
  const formattedDistributions = useMemo(() => 
    distributions.map((dist) => ({
      ...dist,
      grades: dist.total_grades,
      students: dist.total_students,
      title: `${dist.dept_abbr} ${dist.course_num}: ${dist.class_desc}`,
      href: `/class/${dist.dept_abbr}${dist.course_num}`,
    })), [distributions]);

  // Generate cards using existing utility
  const courseCards = useMemo(() => 
    distributionsToCards(formattedDistributions, isMobile, sortingFunc, isStatic),
    [formattedDistributions, isMobile, sortingFunc, isStatic]
  );

  // Set up intersection prefetching for visible items
  useIntersectionPrefetch(
    formattedDistributions,
    (item) => item.href,
    8 // Prefetch up to 8 visible items
  );

  // Render individual row
  const Row = ({ index, style }) => {
    const card = courseCards[index];
    
    return (
      <div 
        style={style}
        data-prefetch-item 
        data-index={index}
      >
        <Box p={2}>
          {card}
        </Box>
      </div>
    );
  };

  // Don't virtualize if list is small
  if (courseCards.length <= 20) {
    return (
      <VStack spacing={4} align="start">
        {courseCards.map((card, index) => (
          <Box 
            key={index}
            data-prefetch-item 
            data-index={index}
            width="100%"
          >
            {card}
          </Box>
        ))}
      </VStack>
    );
  }

  return (
    <Box height={`${Math.min(CONTAINER_HEIGHT, courseCards.length * ITEM_HEIGHT)}px`}>
      <List
        height={Math.min(CONTAINER_HEIGHT, courseCards.length * ITEM_HEIGHT)}
        itemCount={courseCards.length}
        itemSize={ITEM_HEIGHT}
        overscanCount={5} // Render 5 extra items outside viewport for smoother scrolling
      >
        {Row}
      </List>
    </Box>
  );
};

export default VirtualizedCourseList;