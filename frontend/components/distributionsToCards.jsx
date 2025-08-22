import {
  Badge,
  Box,
  chakra,
  Collapse,
  HStack,
  IconButton,
  Tag,
  Text,
  Tooltip,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import React, { useRef, useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  InfoOutlineIcon,
  StarIcon,
} from "@chakra-ui/icons";
import Stats from "./Stats";
import Card from "./Card";
import { letterToColor, termToName, gpaToPastelAnchoredHex, gpaToTextAnchoredHex, rmpToPastelHex, rmpToTextHex } from "../lib/letterTo";

const sortingFunctions = {
  NONE: (array) => array,
  AVERAGE_GPA: (array) =>
    array
      .sort((a, b) => (b.mostStudentsPercent < a.mostStudentsPercent ? -1 : 1))
      .sort((a, b) => (b.averageGPA < a.averageGPA ? -1 : 1)),
  RECENCY: (a, b) => (a.term < b.term ? 1 : -1),
};

const SingleDistribution = ({ dist, isMobile, isStatic }) => {
  const { isOpen, onToggle } = useDisclosure();
  const cardRef = useRef(null);
  const subtitleRef = useRef(null);
  
  const title = dist.title ?? "Unknown";
  let { subtitle } = dist;
  if (!subtitle && dist.terms?.length > 1) {
    const sortedTerms = dist.terms.sort((a, b) => (a.term < b.term ? -1 : 1));
    const startTerm = termToName(sortedTerms[0].term);
    const endTerm = termToName(sortedTerms[sortedTerms.length - 1].term);
    subtitle = `${dist.terms.length} terms from ${startTerm} to ${endTerm}`;
  } else if (!subtitle && dist.terms?.length === 1) {
    subtitle = termToName(dist.term);
  }
  
  const [chevronTop, setChevronTop] = useState(
    dist.hideTitle ? "15px" : (subtitle ? "50px" : "59px")
  );

  useEffect(() => {
    const calculateChevronPosition = () => {
      if (subtitleRef.current && cardRef.current) {
        // Get the subtitle element's position relative to the card
        const cardRect = cardRef.current.getBoundingClientRect();
        const subtitleRect = subtitleRef.current.getBoundingClientRect();
        const relativeTop = subtitleRect.top - cardRect.top;
        setChevronTop(`${relativeTop - 3}px`); // Position slightly above subtitle text
      } else {
        // Fallback to previous logic if refs aren't available
        if (dist.hideTitle) {
          setChevronTop("15px");
        } else {
          // Adjust positioning based on whether subtitle exists
          // Department cards don't have subtitles, so need higher positioning
          setChevronTop(subtitle ? "50px" : "59px");
        }
      }
    };

    // Calculate position immediately, then use requestAnimationFrame for DOM updates
    calculateChevronPosition();
    
    // Also recalculate after next frame to ensure DOM is fully rendered
    const frameId = requestAnimationFrame(calculateChevronPosition);
    
    return () => cancelAnimationFrame(frameId);
  }, [dist.hideTitle, dist.rating, subtitle]); // Removed dist.Component and dist.averageGPA since charts now always render

  return (
    <Box pos={"relative"} width={"full"} ref={cardRef}>
      <Card
        key={dist.distribution_id}
        isSummary={dist.isSummary}
        href={isStatic ? "#" : dist.href}
        isStatic={isStatic}
        spinnerTop={chevronTop}
      >
        <HStack
          justify={"center"}
          align={"center"}
          width={"100%"}
          flexWrap={"wrap"}
        >
          <VStack
            align={"start"}
            flexGrow={1}
            flexShrink={1}
            justifyContent={"center"}
            height={"100%"}
            spacing={0}
            minWidth="180px" /* Ensure there's always enough room for the text */
          >
            {!dist.hideTitle && (
              <HStack spacing={2.5} align={"center"}>
                <Text
                  fontSize={dist.isSummary ? "3xl" : "lg"}
                  fontWeight={"bold"}
                  color={"#003057"}
                >
                  {/* black instead of "#003057" is also an option */}
                  {(!isStatic || !dist.isSummary) && title}
                </Text>
                {dist.rating && (
                  <Tooltip label={"RateMyProfessor Rating"} hasArrow>
                    <Tag
                      size={"sm"}
                      textAlign={"center"}
                      bg={rmpToPastelHex(dist.rating)}
                      color={rmpToTextHex(dist.rating)}
                      py={1}
                      px={1.5}
                      fontSize={"xs"}
                    >
                      <chakra.span mt={-0.5} pr={0.5} fontSize={"xs"}>
                        <StarIcon boxSize="10px" />
                      </chakra.span>
                      {dist.rating.toFixed(1)}/5
                    </Tag>
                  </Tooltip>
                )}
              </HStack>
            )}
            {subtitle && (
              <Text 
                ref={subtitleRef}
                fontSize={"xs"} 
                fontWeight={"300"}
                cursor={dist.terms && dist.terms.length > 1 ? "pointer" : "default"}
                onClick={dist.terms && dist.terms.length > 1 ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle();
                } : undefined}
                transition="all 0.2s ease"
                _hover={dist.terms && dist.terms.length > 1 ? {
                  color: "#003057",
                  transform: "translateX(2px)",
                } : {}}
              >
                {subtitle} 
              </Text>
              // color to "#003057" is also an option color={"#003057"}, empty would be black
            )}
            <HStack pt={2}>
              {dist.averageGPA > 0 && (
                <Tag
                  size={"sm"}
                  textAlign={"center"}
                  bg={gpaToPastelAnchoredHex(dist.averageGPA)}
                  color={gpaToTextAnchoredHex(dist.averageGPA, 0.3)}
                  py={1}
                >
                  GPA: {dist.averageGPA}
                </Tag>
              )}
              <Tag
                size={"sm"}
                textAlign={"center"}
                colorScheme={letterToColor(dist.mostStudents)}
                py={1}
              >
                Most Common: {dist.mostStudents} ({dist.mostStudentsPercent}
                %)
              </Tag>
            </HStack>
            {dist.info && (
              <Text fontSize={"sm"} color={"gray.600"} pt={2}>
                {dist.info}
              </Text>
            )}
          </VStack>

          <VStack spacing={1} flexShrink={0} overflow="visible">
            <HStack>
              <Badge>{dist.students} students</Badge>
            </HStack>
            {/* Chart container with overflow handling */}
            <Box overflow="visible" flexShrink={0}>
              {dist.Component}
            </Box>
          </VStack>
        </HStack>
        {dist.terms && dist.terms.length > 1 && (
          <Collapse in={isOpen} animateOpacity>
            <VStack spacing={3} p={2} pt={3}>
              {dist.terms?.sort(sortingFunctions.RECENCY).map((term) => (
                <SingleDistribution
                  key={term.distribution_id || term.term}
                  dist={{
                    ...term,
                    ...Stats({ distribution: term, isMobile }),
                    subtitle: termToName(term.term),
                    hideTitle: true,
                    href: term.href, // Add href for hover feedback
                  }}
                  isMobile={isMobile}
                  isStatic={isStatic}
                />
              ))}
            </VStack>
          </Collapse>
        )}
      </Card>
      {!isStatic && !isMobile && dist.terms && dist.terms.length > 1 && (
        <IconButton
          pos={"absolute"}
          size={"xs"}
          top={chevronTop}
          left={"0px"}
          aria-label={"toggle dropdown"}
          variant={"ghost"}
          colorScheme={"blackAlpha"}
          rounded={"full"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }}
          transition="all 0.2s ease"
          _hover={{
            bg: "blackAlpha.100",
            transform: "scale(1.1)",
          }}
        >
          {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </IconButton>
      )}
    </Box>
  );
};

export const distributionsToCards = (
  array,
  isMobile,
  sortingFunc = "AVERAGE_GPA",
  isStatic = false
) =>
  array &&
  sortingFunctions[sortingFunc](
    array
      .filter((dist) => dist.title)
      .map((distribution) => ({
        ...distribution,
        ...Stats({ distribution, isMobile }),
      }))
  ).map((dist) => (
    <SingleDistribution
      key={dist.id ?? dist.title}
      dist={dist}
      isMobile={isMobile}
      isStatic={isStatic}
    />
  ));
