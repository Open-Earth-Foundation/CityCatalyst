import { Flex, Skeleton, VStack } from "@chakra-ui/react";

export function RunCardSkeleton() {
  return (
    <VStack
      align="stretch"
      gap={3}
      minH="178px"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={4}
    >
      <Flex justify="space-between" gap={4}>
        <Skeleton h="20px" w="58%" />
        <Skeleton h="24px" w="88px" borderRadius="pill" />
      </Flex>
      <Skeleton h="16px" w="76%" />
      <Skeleton h="4px" w="full" borderRadius="pill" />
      <Skeleton h="16px" w="52%" />
      <Skeleton mt="auto" h="32px" w="90px" borderRadius="pill" />
    </VStack>
  );
}
