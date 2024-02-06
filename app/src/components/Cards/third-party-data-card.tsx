import { Box, Card, Text } from "@chakra-ui/react";
import { FcGoogle } from "react-icons/fc";

const ThirdPartyDataCard = () => {
  return (
    <Card
      w="331px"
      h="100px"
      shadow="none"
      borderRadius="8px"
      borderWidth="1px"
      borderColor="border.overlay"
      py="16px"
      px="16px"
    >
      <Box display="flex" gap="16px">
        <Box>
          <FcGoogle size="32px" />
        </Box>
        <Box display="flex" flexDirection="column" gap="8px">
          <Text
            fontSize="label.lg"
            fontWeight="bold"
            fontStyle="normal"
            fontFamily="heading"
            lineHeight="20px"
            letterSpacing="wide"
          >
            Energy industries - Google Environmental Insights
          </Text>
          <Text
            fontSize="body.md"
            fontWeight="normal"
            fontStyle="normal"
            lineHeight="20px"
            letterSpacing="wide"
            color="interactive.control"
          >
            Data Quality: High | Scope: 1
          </Text>
        </Box>
      </Box>
    </Card>
  );
};

export default ThirdPartyDataCard;
