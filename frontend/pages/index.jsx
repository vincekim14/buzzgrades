import React from "react";
import {
  Box,
  Collapse,
  Flex,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react";
import PageLayout from "../components/Layout/PageLayout";
import SearchBar from "../components/Search/SearchBar";
import SearchResults from "../components/Search/SearchResults";
import { useSearch } from "../components/Search/useSearch";
import { searchDurations } from "../lib/config";
import Conveyor from "../components/Landing/Conveyor";

const MAX_SEARCH_WIDTH = "min(720px, calc(100vw - 48px))"; // shared target width

const Home = () => {
  const {
    search,
    searchResults,
    pageShown: [rawShowPage, setShowPage],
    handleChange,
  } = useSearch();

  const showPage = rawShowPage && !search;

  return (
    <PageLayout
      // Main promotional image for home page social sharing (Open Graph) 
      // Should be 1200x630px PNG with Buzz Grades branding and service description
      // Displays when home page is shared on social media platforms
      imageUrl={`${
        process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/images/advert.png`
          : "/images/advert.png"
      }`}
    >
      {/* Background conveyor is now removed; we will show an inline conveyor below the search bar */}
      <Flex
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
        width="100%"
      >
        <VStack align="center" spacing={[2, 4, 6]} width="100%">
          <Collapse
            unmountOnExit={false}
            in={showPage}
            startingHeight={0.01}
            animateOpacity
            transition={{
              exit: { duration: searchDurations.exit },
              enter: { duration: searchDurations.enter },
            }}
            style={{ width: "100%" }}
          >
            <Heading
              fontSize={["50px", "55px", "90px"]}
              paddingTop={[0, 10, "calc(40vh - 185px)"]}
              textAlign={["center"]}
            >
              Buzz Grades
            </Heading>
            <Text
              maxW={["90%", "75%", "60%"]}
              mx="auto"
              style={{ color: "black" }}
              textAlign={["center"]}
              py={[4, 6, 4]}
              fontWeight={300}
            >
              View grade distributions for <i>all</i> <strong>courses</strong> and <strong>instructors</strong> at Georgia Tech
            </Text>
          </Collapse>
          <Box
            pt={[0, 2, 0]}
            pb={[5, 0, 5]}
            width="100%"
            style={{
              transition: "all 200ms ease",
            }}
          >
            <Box mx="auto" style={{ maxWidth: MAX_SEARCH_WIDTH }}>
              <SearchBar
                placeholder={search || undefined}
                onChange={handleChange}
              />
            </Box>
          </Box>
          {/* Inline conveyor shows only while hero is visible (no input yet) */}
          {showPage && (
            <Box width="100%" mt={[2, 4, 8]}>
              <Conveyor inline />
            </Box>
          )}
        </VStack>
      </Flex>
      <SearchResults
        search={search}
        searchResults={searchResults}
        pageShown={[showPage, setShowPage]}
      />
      <Box pb={[200, 250, 100]} />
    </PageLayout>
  );
};

export default Home;
