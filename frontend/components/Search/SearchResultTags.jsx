import { Tag } from "@chakra-ui/react";
import {
  letterToColor,
  gpaToPastelAnchoredHex,
  gpaToTextAnchoredHex,
} from "../../lib/letterTo";

export const AverageGradeTag = ({ gpa }) => (
  <Tag
    size={"sm"}
    textAlign={"center"}
    bg={gpaToPastelAnchoredHex(gpa)}
    color={gpaToTextAnchoredHex(gpa, 0.3)}
    py={1}
    px={2}
    fontSize={"xs"}
    height={"24px"}
    minWidth={"50px"}
  >
    GPA: {gpa}
  </Tag>
);

export const MostCommonGradeTag = ({ grade, percentage }) => (
  <Tag
    size={"sm"}
    textAlign={"center"}
    colorScheme={letterToColor(grade)}
    py={1}
    px={2}
    fontSize={"xs"}
    height={"24px"}
    minWidth={"100px"}
  >
    Most Common: {grade} ({Number(percentage).toFixed(1)}%)
  </Tag>
);
