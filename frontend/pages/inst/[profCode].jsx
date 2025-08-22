import React from "react";
import {
  Box,
  Collapse,
  Divider,
  Heading,
  useMediaQuery,
  VStack,
  Wrap,
} from "@chakra-ui/react";
import PageLayout from "../../components/Layout/PageLayout";
import SearchBar from "../../components/Search/SearchBar";
import { getInstructorClasses, getInstructorInfo } from "../../lib/db";
import { distributionsToCards } from "../../components/distributionsToCards";
import { useSearch } from "../../components/Search/useSearch";
import SearchResults from "../../components/Search/SearchResults";
import BigNumberCard from "../../components/BigNumberCard";
import BigPercentageCard from "../../components/BigPercentageCard";

export default function Prof({ profData }) {
  const {
    id,
    name,
    distributions,
    RMP_link: RMPLink,
    RMP_score: RMPScore,
    RMP_diff: RMPDiff,
    RMP_would_take_again: RMPWouldTakeAgain,
  } = profData;
  const [isMobile] = useMediaQuery("(max-width: 550px)");

  const {
    search,
    searchResults,
    pageShown: [showPage, setShowPage],
    handleChange,
  } = useSearch();

  // Helper function to calculate months since a term
  const getMonthsSinceTerm = (term) => {
    if (!term) return 0;
    
    // Parse term format YYYYMM (e.g., 202308 = Fall 2023)
    const termStr = String(term);
    const year = parseInt(termStr.substring(0, 4), 10);
    const month = parseInt(termStr.substring(4, 6), 10);
    
    const termDate = new Date(year, month - 1); // month is 0-indexed
    const now = new Date();
    
    const diffTime = now.getTime() - termDate.getTime();
    const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); // approximate months
    
    return Math.max(0, diffMonths);
  };

  // Decay function: 18-month half-life
  const decay = (monthsSince) => {
    return 0.5 ** (monthsSince / 18);
  };

  // Calculate weighted score for each course
  const calculateCourseScore = (dist) => {
    // If terms array exists, use it; otherwise use single term data
    if (dist.terms && dist.terms.length > 0) {
      return dist.terms.reduce((totalScore, termData) => {
        const monthsSince = getMonthsSinceTerm(termData.term);
        const enrollment = termData.students || 0;
        return totalScore + (enrollment * decay(monthsSince));
      }, 0);
    } else {
      // Single term data
      const monthsSince = getMonthsSinceTerm(dist.term);
      const enrollment = dist.students || 0;
      return enrollment * decay(monthsSince);
    }
  };

  // map all class distribution to a proper format:
  const formattedDistributions = distributions
    .map((dist) => ({
      ...dist,
      title: `${dist.dept_abbr} ${dist.course_num}: ${dist.class_desc}`,
      href: `/class/${dist.dept_abbr}${dist.course_num}`,
      weightedScore: calculateCourseScore(dist),
    }))
    // Sort by weighted score descending (most relevant courses first)
    .sort((a, b) => b.weightedScore - a.weightedScore);
    
    // Previous sorting logic (commented out):
    // // sort by subject alphabetically, then by course number numerically
    // .sort((a, b) => {
    //   // First sort by subject alphabetically
    //   if (a.dept_abbr !== b.dept_abbr) {
    //     return a.dept_abbr.localeCompare(b.dept_abbr);
    //   }
    //   // Then sort by course number numerically
    //   return parseInt(a.course_num, 10) - parseInt(b.course_num, 10);
    // });

  const totalDistribution = {
    // take every distribution's grades map and sum up each key
    grades: formattedDistributions.reduce(
      (acc, curr) => ({
        ...acc,
        ...Object.fromEntries(
          Object.entries(curr.grades).map(([key, val]) => [
            key,
            (acc[key] || 0) + val,
          ])
        ),
      }),
      {}
    ),
    students: formattedDistributions.reduce(
      (acc, curr) => acc + (curr.students || 0),
      0
    ),
    title: "All Courses",
    isSummary: true,
    info: "This total also includes courses that they may not teach anymore",
    distribution_id: id,
  };

  const totalDistributions = distributionsToCards(
    [totalDistribution],
    isMobile
  );

  const renderedDistributions = distributionsToCards(
    formattedDistributions,
    isMobile,
    "NONE"
  );

  return (
    <PageLayout
      title={`${name} | Buzz Grades`}
      imageURL={`${
        process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : ""
      }/api/image/prof/${id}`}
    >
      <Box py={8} align={"start"} width={"100%"}>
        <Box mx={"auto"} style={{ maxWidth: "min(720px, calc(100vw - 48px))" }}>
          <SearchBar placeholder={search || undefined} onChange={handleChange} />
        </Box>
        <SearchResults
          searchResults={searchResults}
          search={search}
          pageShown={[showPage, setShowPage]}
        />
        <Collapse
          in={showPage}
          animateOpacity
          style={{
            width: "100%",
            paddingRight: 10,
            paddingLeft: 10,
          }}
        >
          <Heading my={4}>{name}</Heading>
          <VStack spacing={4} align={"start"} pb={4} minH={"60vh"}>
            {totalDistributions}

            {RMPScore && (
              <Wrap spacing={"8px"} width={"100%"} overflow={"visible"} mb={2}>
                <BigNumberCard
                  href={RMPLink}
                  source={"Rate My Professor"}
                  val={RMPScore.toFixed(1)}
                  outOf={5}
                />
                <BigNumberCard
                  href={RMPLink}
                  source={"Difficulty"}
                  val={RMPDiff.toFixed(1)}
                  outOf={5}
                />
                {RMPWouldTakeAgain !== null && RMPWouldTakeAgain !== undefined && (
                  <BigPercentageCard
                    href={RMPLink}
                    source={"Would Take Again"}
                    val={RMPWouldTakeAgain}
                  />
                )}
              </Wrap>
            )}
            <Divider
              orientation={"horizontal"}
              style={{
                borderColor: "#B3A369", // GT Tech Gold
                borderBottomWidth: 1,
                opacity: 0.15,
              }}
            />
            {renderedDistributions}
          </VStack>
        </Collapse>
      </Box>
    </PageLayout>
  );
}

export async function getServerSideProps({ res, params }) {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${60 * 60 * 24 * 7}, stale-while-revalidate=${
      60 * 60 * 24 * 30 // if loaded within a month, use the stale cache, but re-render in the background
    }`
  );
  if (!params.profCode) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const { profCode } = params;

  const info = await getInstructorInfo(profCode);

  if (info.length === 0) {
    return {
      redirect: {
        destination: `/?q=${profCode}`,
        permanent: false,
      },
    };
  }

  const distributions = await getInstructorClasses(profCode);

  return {
    props: {
      profData: {
        ...info[0],
        distributions,
      },
    },
  };
}
