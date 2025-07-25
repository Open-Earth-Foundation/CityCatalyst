import { Box, Card } from "@chakra-ui/react";

const LoadingCard = () => (
  <Card.Root
    shadow="none"
    display="flex"
    gap="16px"
    flexDir="row"
    borderWidth="1px"
    borderColor="border.overlay"
    my={2}
  >
    <Card.Body>
      <Box display="flex" flexDirection="column" gap="16px">
        <Box
          h="48px"
          borderRadius="50%"
          w="48px"
          bg="background.backgroundLoading"
        />
        <Box h="16px" w="461px" bg="background.backgroundLoading" />
        <Box h="8px" w="300px" bg="background.backgroundLoading" />
      </Box>
    </Card.Body>
  </Card.Root>
);

const LoadingState = () => (
  <Box w="full" animation="pulse">
    <Box display="flex" flexDir="column" gap="16px">
      <Box h="16px" w="461px" bg="background.backgroundLoading" />
      <Box h="8px" w="300px" bg="background.backgroundLoading" />
      <Box h="8px" w="300px" bg="background.backgroundLoading" />
      <Box
        mt="48px"
        mb="16px"
        h="16px"
        w="461px"
        bg="background.backgroundLoading"
      />
      <LoadingCard />
      <LoadingCard />
      <LoadingCard />
    </Box>
  </Box>
);

export default LoadingState;
