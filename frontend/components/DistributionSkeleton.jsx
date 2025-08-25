import { Box, HStack, VStack, Skeleton, SkeletonText } from "@chakra-ui/react";
import Card from "./Card";

const DistributionSkeleton = ({ count = 3 }) => {
  return (
    <>
      {[...Array(count)].map((_, index) => (
        <Box key={index} width="100%">
          <Card>
            <HStack justify="space-between" align="center" width="100%">
              <VStack align="start" spacing={2} flex="1">
                <Skeleton height="24px" width="200px" />
                <Skeleton height="14px" width="120px" />
                <HStack spacing={2}>
                  <Skeleton height="24px" width="80px" />
                  <Skeleton height="24px" width="140px" />
                </HStack>
              </VStack>
              <VStack spacing={1} flexShrink={0}>
                <Skeleton height="20px" width="80px" />
                <Skeleton height="60px" width="80px" />
              </VStack>
            </HStack>
          </Card>
        </Box>
      ))}
    </>
  );
};

export default DistributionSkeleton;