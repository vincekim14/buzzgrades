import {
  Heading,
  ListItem,
  OrderedList,
  Text,
  UnorderedList,
} from "@chakra-ui/react";
import React from "react";

export function useMDXComponents(components) {
  const chakraComponents = {
    h1: (params) => (
      <Heading
        fontSize={["3xl", "4xl", "5xl"]}
        pt={10}
        pb={5}
        textAlign={["center", "left", "left"]}
        {...params}
      />
    ),
    h2: (params) => <Heading py={2} fontSize={"xl"} {...params} />,
    h3: (params) => <Heading py={2} fontSize={"lg"} {...params} />,
    h4: (params) => <Heading py={2} fontSize={"md"} {...params} />,
    p: (params) => <Text py={1} {...params} />,
    ul: (params) => <UnorderedList py={1} {...params} />,
    ol: (params) => <OrderedList py={1} {...params} />,
    li: (params) => <ListItem {...params} />,
  };
  return { ...components, ...chakraComponents };
}
