import {
  Avatar,
  Box,
  Divider,
  Heading,
  HStack,
  IconButton,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import NextLink from "next/link";
import React from "react";
import { FaGithub, FaHome, FaLinkedinIn } from "react-icons/fa";
import LinkButton from "../LinkButton";
import trackEvent from "../../lib/track";

const ContributorGroup = () => {
  const contributors = [
    {
      login: "vincekim14",
      name: "Vince Kim",
      role: "Website Lead",
      avatar_url: "https://avatars.githubusercontent.com/u/youruserid?v=4", // Replace with your actual image URL
      linkedin: "https://www.linkedin.com/in/vince-kim-profile/",
      website: "https://google.com",
      github: "https://github.com/vincekim14/",
    }
  ];

  return (
    <VStack spacing={0} mb={-4} mt={5}>
      <Wrap spacing={10} overflow={"visible"} justify={"center"} mb={4}>
        {contributors.map((c) => (
            <WrapItem>
              <VStack
                boxShadow={"0px 0px 8px rgba(0, 48, 87, 0.1)"}
                backgroundColor={"rgba(255,255,255,0.4)"}
                width={250}
                py={8}
                borderRadius={10}
              >
                <Avatar size={"xl"} name={c.name} src={c.avatar_url} />
                <Heading fontSize={20}>{c.name}</Heading>
                <Text fontSize={14} fontWeight={300}>
                  {c.role}
                </Text>
                <HStack spacing={4}>
                  {c.linkedin && (
                    <IconButton
                      href={c.linkedin}
                      target={"_blank"}
                      onClick={() => {
                        trackEvent(`button.${c.login}.linkedin.click`, {
                          type: "footer",
                        });
                      }}
                      as={"a"}
                      size={"sm"}
                      aria-label={"LinkedIn"}
                      icon={<FaLinkedinIn size={20} />}
                    />
                  )}
                  {c.website && (
                    <IconButton
                      href={c.website}
                      target={"_blank"}
                      onClick={() => {
                        trackEvent(`button.${c.login}.website.click`, {
                          type: "footer",
                        });
                      }}
                      as={"a"}
                      size={"sm"}
                      aria-label={"Website"}
                      icon={<FaHome size={20} />}
                    />
                  )}
                  {c.github && (
                    <IconButton
                      href={c.github}
                      target={"_blank"}
                      onClick={() => {
                        trackEvent(`button.${c.login}.github.click`, {
                          type: "footer",
                        });
                      }}
                      as={"a"}
                      size={"sm"}
                      aria-label={"Github"}
                      icon={<FaGithub size={20} />}
                    />
                  )}
                  {/* Put the extra commented out code if you are maintaining the website */}
                </HStack>
              </VStack>
            </WrapItem>
          ))}
      </Wrap>

      {/* <Wrap justify={"center"} pb={4}>
        {contributors.map((c) => (
          <GithubAvatar
            key={c.login}
            name={c.name ? `${c.name} (${c.login})` : c.login}
            src={c.avatar_url}
            href={c.html_url}
            as={"a"}
            onClick={() => {
              trackEvent(`avatar.${c.login}.click`, {
                type: "footer",
              });
            }}
            target={"_blank"}
            opacity={0.7}
            transitionDuration={"200ms"}
            _hover={{
              opacity: 1,
            }}
          />
        ))}
      </Wrap> */}
      {/* <Button
        size={"xs"}
        fontWeight={300}
        variant={"outline"}
        as={"a"}
        target={"_blank"}
        onClick={() => {
          trackEvent(`button.github_contribute.click`, {
            type: "footer",
          });
        }}
        href={"github link"}
      >
        Contribute on our Github
      </Button> */}
    </VStack>
  );
};

export const Footer = () => {
  return (
    <Box pt={10} pb={10}>
      <Divider borderColor={"rgba(0, 48, 87, 0.42)"} mb={0} />
      <VStack spacing={4}>
        <ContributorGroup />
        <Text
          textAlign={"center"}
          fontSize={"sm"}
          fontWeight={300}
          color={"gray.600"}
        >
          <NextLink href={"/"}>Buzz Grades</NextLink> is maintained by{" "}
          <LinkButton
            target={"_blank"}
            href={"https://www.linkedin.com/in/vince-kim-profile/"}
            fontWeight={500}
          >
            Vince Kim
          </LinkButton>{" "}
          with grade data from Summer 2016 to Summer 2025 provided by LITE Grade Distribution
        </Text>
        <Text
          textAlign={"center"}
          fontSize={"sm"}
          fontWeight={300}
          color={"gray.600"}
        >
          Buzz Grades is not affiliated with the Georgia Institute of Technology
        </Text>
        <LinkButton
          color={"gray.900"}
          fontWeight={"300"}
          target={"_blank"}
          href={"/privacy"}
        >
          Privacy Policy
        </LinkButton>
      </VStack>
    </Box>
  );
};