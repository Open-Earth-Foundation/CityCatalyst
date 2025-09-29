import { Box, Stack, Text } from "@chakra-ui/react";
import { CCTerraButton } from "./CCTerraButton";
import { FiAlertCircle, FiArrowRight } from "react-icons/fi";

export default function CCTerraButtonDemo() {
  return (
    <Box p={8} bg="#f7f8fa">
      <Stack direction="column" gap={12} alignItems="flex-start" w="full">
        {/* Filled Buttons */}
        <Box w="full">
          <Stack direction="row" gap={12} alignItems="center">
            <CCTerraButton variant="filled">Button</CCTerraButton>
            <CCTerraButton variant="filled" isError>
              Button
            </CCTerraButton>
            <CCTerraButton variant="filled" leftIcon={<FiAlertCircle />}>
              Left Icon
            </CCTerraButton>
            <CCTerraButton variant="filled" rightIcon={<FiArrowRight />}>
              Right Icon
            </CCTerraButton>
            <Text
              fontFamily="Poppins"
              fontWeight={600}
              fontSize="22px"
              w="200px"
            >
              Default / Error / Icons
            </Text>
            <Text fontFamily="Open Sans" fontSize="16px" w="400px">
              Filled is the standard button type that conveys a general action.
              Use this by default. Hover and press status
            </Text>
          </Stack>
        </Box>
        <Box w="full" borderBottom="1px solid rgba(215,216,250,1)" />
        {/* Outlined Buttons */}
        <Box w="full">
          <Stack direction="row" gap={12} alignItems="center">
            <CCTerraButton variant="outlined" status="default">
              Button
            </CCTerraButton>
            <CCTerraButton variant="outlined" isError>
              Button
            </CCTerraButton>
            <CCTerraButton variant="outlined" leftIcon={<FiAlertCircle />}>
              Left Icon
            </CCTerraButton>
            <CCTerraButton variant="outlined" rightIcon={<FiArrowRight />}>
              Right Icon
            </CCTerraButton>
            <Text
              fontFamily="Poppins"
              fontWeight={600}
              fontSize="22px"
              w="200px"
            >
              Default / Error / Icons
            </Text>
            <Text fontFamily="Open Sans" fontSize="16px" w="400px">
              Use an outlined button for actions that need attention but aren’t
              the primary action. Hover and press status
            </Text>
          </Stack>
        </Box>
        <Box w="full" borderBottom="1px solid rgba(215,216,250,1)" />
        {/* Text Buttons */}
        <Box w="full">
          <Stack direction="row" gap={12} alignItems="center">
            <CCTerraButton variant="text" status="default">
              Button
            </CCTerraButton>
            <CCTerraButton variant="text" isError>
              Button
            </CCTerraButton>
            <CCTerraButton variant="text" leftIcon={<FiAlertCircle />}>
              Left Icon
            </CCTerraButton>
            <CCTerraButton variant="text" rightIcon={<FiArrowRight />}>
              Right Icon
            </CCTerraButton>
            <Text
              fontFamily="Poppins"
              fontWeight={600}
              fontSize="22px"
              w="200px"
            >
              Default / Error / Icons
            </Text>
            <Text fontFamily="Open Sans" fontSize="16px" w="400px">
              Text buttons have less visual prominence, so should be used for
              low emphasis actions, such as an alternative option. Hover and
              press status
            </Text>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
