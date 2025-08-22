import React from "react";
import {
  Box,
  Collapse,
  Divider,
  Heading,
  HStack,
  IconButton,
  Link as ChakraLink,
  Stack,
  Tag,
  Text,
  useDisclosure,
  useMediaQuery,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import NextLink from "next/link";
import PageLayout from "../../components/Layout/PageLayout";
import SearchBar from "../../components/Search/SearchBar";
import { getClassInfo, getDistribution } from "../../lib/db";
import { distributionsToCards } from "../../components/distributionsToCards";
import { useSearch } from "../../components/Search/useSearch";
import SearchResults from "../../components/Search/SearchResults";
import CourseCodeText from "../../components/CourseCodeText";

const SPECIAL_TAGS = ["Honors", "Freshman Seminar", "Topics Course"];

const DepartmentButton = ({ deptAbbr }) => (
  <ChakraLink
    as={NextLink}
    href={`/dept/${deptAbbr}`}
    style={{
      fontWeight: "900",
    }}
    _after={{
      content: '" "',
      display: "inline",
    }}
  >
    {deptAbbr}
  </ChakraLink>
);

export default function Class({ classData, query }) {
  const {
    class_desc: classDesc,
    oscarTitle,
    oscarDesc,
    distributions,
    libEds,
    creditHours,
    prerequisites,
    corequisites,
    restrictions,
    dept_abbr: deptAbbr,
    course_num: classNumber,
  } = classData;

  const className = `${deptAbbr} ${classNumber}`;

  const [isMobile] = useMediaQuery("(max-width: 550px)");
  const { isOpen: isRequisitesOpen, onToggle: toggleRequisites, onClose: closeRequisites } =
    useDisclosure();
  const {
    search,
    searchResults,
    pageShown: [showPage, setShowPage],
    handleChange,
  } = useSearch();

  const totalDistributions = distributionsToCards(
    [
      {
        grades: classData.total_grades,
        students: classData.total_students,
        title: "All Instructors",
        distribution_id: classData.id,
        isSummary: true,
        info: "This total includes data from semesters with unknown instructors",
      },
    ],
    isMobile,
    "NONE",
    !!query.static
  );

  const pageLayoutProps = {
    title: `${oscarTitle || classDesc} (${className}) | Buzz Grades`,
    imageURL: `${
      process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : ""
    }/api/image/class/${deptAbbr}${classNumber}`,
  };

  const formattedDistributions = distributions.map((dist) => ({
    ...dist,
    href: `/inst/${dist.professor_id}`,
    title: dist.professor_name,
    rating: dist.professor_RMP_score,
  }));

  if (query.static === "all")
    return (
      <PageLayout {...pageLayoutProps} scriptOnly>
        {totalDistributions}
      </PageLayout>
    );
  if (query.static) {
    const filtered = formattedDistributions.filter((dist) =>
      dist.title.toLowerCase().includes(query.static.toLowerCase())
    );

    return (
      <PageLayout {...pageLayoutProps} scriptOnly>
        {distributionsToCards(filtered, isMobile, "NONE", true)}
      </PageLayout>
    );
  }

  const renderedDistributions = distributionsToCards(
    formattedDistributions,
    isMobile
  );

  const libEdTags = libEds
    .sort(
      (a, b) =>
        SPECIAL_TAGS.includes(b.name) - SPECIAL_TAGS.includes(a.name) ||
        a.name.localeCompare(b.name)
    )
    .map((libEd) => (
      <Tag
        key={libEd.id}
        colorScheme={SPECIAL_TAGS.includes(libEd.name) ? "yellow" : "blue"}
        variant={"solid"}
        size={"sm"}
      >
        {libEd.name}
      </Tag>
    ));

  return (
    <PageLayout {...pageLayoutProps}>
      <Box py={8} align={"start"} width={"100%"}>
        <Box mx={"auto"} style={{ maxWidth: "min(720px, calc(100vw - 48px))" }}>
          <SearchBar
            placeholder={search || undefined}
            onChange={handleChange}
          />
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
          <Heading mt={4}>
            <DepartmentButton deptAbbr={deptAbbr} />
            {classNumber}: {oscarTitle || classDesc}
          </Heading>
          <Stack direction={["column", "row"]} mt={2} spacing={2} wrap={"wrap"}>
            {creditHours && (
              <Tag size={"md"}>
                {creditHours} Credit{creditHours !== "1" ? "s" : ""}
              </Tag>
            )}
            {libEdTags}
          </Stack>
          {oscarDesc && (
            <Text mt={2} mb={2} fontSize={"sm"}>
              {oscarDesc}
            </Text>
          )}

          {/* Collapsible Requisites Section */}
          {(prerequisites ||
            (corequisites && corequisites.length > 0) ||
            (restrictions && restrictions.length > 0)) && (
            <Box mb={4} mt={2} position={"relative"} ml={-1}>
              <HStack spacing={0}>
                <IconButton
                  pos={"relative"}
                  // h={"20px"}
                  // minW={"20px"}
                  h={"16px"}
                  minW={"16px"}
                  variant={"ghost"}
                  colorScheme={"blackAlpha"}
                  rounded={"full"}
                  aria-label={"toggle requisites"}
                  onClick={toggleRequisites}
                  transition={"all 0.2s ease"}
                  _hover={{
                    bg: "blackAlpha.100",
                    transform: "scale(1.1)",
                  }}
                >
                  {isRequisitesOpen ? (
                    <ChevronDownIcon />
                  ) : (
                    <ChevronRightIcon />
                  )}
                </IconButton>
                <Text
                  fontSize={"sm"}
                  fontWeight={"bold"}
                  cursor={"pointer"}
                  onClick={toggleRequisites}
                  transition={"all 0.2s ease"}
                  _hover={{
                    color: "#003057",
                    transform: "translateX(2px)",
                  }}
                >
                  Requisites
                </Text>
              </HStack>

              <Collapse in={isRequisitesOpen} animateOpacity>
                <VStack spacing={3} p={2} pt={3} align={"start"}>
                  {prerequisites && prerequisites.length > 0 && (
                    <Box>
                      <Text fontSize={"sm"} fontWeight={"bold"} mb={1}>
                        Prerequisites:
                      </Text>
                      <CourseCodeText fontSize={"sm"} onCourseCodeClick={closeRequisites}>
                        {Array.isArray(prerequisites)
                          ? prerequisites.join(", ")
                          : prerequisites}
                      </CourseCodeText>
                    </Box>
                  )}

                  {corequisites && corequisites.length > 0 && (
                    <Box>
                      <Text fontSize={"sm"} fontWeight={"bold"} mb={1}>
                        Corequisites:
                      </Text>
                      <CourseCodeText fontSize={"sm"} onCourseCodeClick={closeRequisites}>
                        {Array.isArray(corequisites)
                          ? corequisites.join(", ")
                          : corequisites}
                      </CourseCodeText>
                    </Box>
                  )}

                  {restrictions && restrictions.length > 0 && (
                    <Box>
                      <Text fontSize={"sm"} fontWeight={"bold"} mb={1}>
                        Restrictions:
                      </Text>
                      <VStack align={"start"} spacing={0}>
                        {restrictions.map((restriction) => (
                          <CourseCodeText key={restriction} fontSize={"sm"} onCourseCodeClick={closeRequisites}>
                            {restriction}
                          </CourseCodeText>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </VStack>
              </Collapse>
            </Box>
          )}
          <VStack spacing={4} align={"start"} pb={4} minH={"50vh"}>
            {totalDistributions}
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

export async function getServerSideProps({ res, params, query }) {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${60 * 60 * 24 * 7}, stale-while-revalidate=${
      60 * 60 * 24 * 30 // if loaded within a month, use the stale cache, but re-render in the background
    }`
  );
  if (!params.classCode) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const { classCode } = params;

  const info = await getClassInfo(classCode);

  if (info.length === 0 && !query.static) {
    return {
      redirect: {
        destination: `/?q=${classCode}`,
        permanent: false,
      },
    };
  }
  if (info.length === 0 && query.static) {
    return {
      notFound: true,
    };
  }

  const distributions = await getDistribution(classCode);

  if (query.static && query.static !== "all") {
    const filtered = distributions.filter((dist) =>
      dist.professor_name.toLowerCase().includes(query.static.toLowerCase())
    );
    if (filtered.length === 0) {
      return {
        notFound: true,
      };
    }
  }

  return {
    props: {
      classData: {
        ...info[0],
        distributions,
      },
      query,
    },
  };
}
