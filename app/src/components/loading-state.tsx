import { Box, Card } from "@chakra-ui/react";

const LoadingState = () => (
  <Box w="full" className="animate-pulse">
    <Box display="flex" flexDir="column" gap="16px">
      <Box h="16px" w="461px" bg="background.backgroundLoading" />
      <Box h="8px" w="300px" bg="background.backgroundLoading" />
      <Box h="8px" w="300px" bg="background.backgroundLoading" />
    </Box>
    <Box>
      <Box
        mt="48px"
        mb="16px"
        h="16px"
        w="461px"
        bg="background.backgroundLoading"
      />
      <Card.Root
        shadow="none"
        display="flex"
        gap="16px"
        flexDir="row"
        borderWidth="1px"
        borderColor="border.overlay"
      >
        <Box>
          <Box
            h="48px"
            borderRadius="50%"
            w="48px"
            bg="background.backgroundLoading"
          />
        </Box>
        <Box display="flex" flexDirection="column" gap="16px">
          <Box h="16px" w="461px" bg="background.backgroundLoading" />
          <Box h="8px" w="300px" bg="background.backgroundLoading" />
        </Box>
      </Card.Root>
      <Card.Root
        shadow="none"
        my="16px"
        display="flex"
        gap="16px"
        flexDir="row"
        borderWidth="1px"
        borderColor="border.overlay"
      >
        <Box>
          <Box
            h="48px"
            borderRadius="50%"
            w="48px"
            bg="background.backgroundLoading"
          />
        </Box>
        <Box display="flex" flexDirection="column" gap="16px">
          <Box h="16px" w="461px" bg="background.backgroundLoading" />
          <Box h="8px" w="300px" bg="background.backgroundLoading" />
        </Box>
      </Card.Root>
      <Card.Root
        shadow="none"
        my="16px"
        display="flex"
        gap="16px"
        flexDir="row"
        borderWidth="1px"
        borderColor="border.overlay"
      >
        <Box>
          <Box
            h="48px"
            borderRadius="50%"
            w="48px"
            bg="background.backgroundLoading"
          />
        </Box>
        <Box display="flex" flexDirection="column" gap="16px">
          <Box h="16px" w="461px" bg="background.backgroundLoading" />
          <Box h="8px" w="300px" bg="background.backgroundLoading" />
        </Box>
      </Card.Root>
    </Box>
  </Box>
);

export default LoadingState;
