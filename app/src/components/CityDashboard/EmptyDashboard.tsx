import { Box, Text, VStack } from "@chakra-ui/react";
import { MdBarChart } from "react-icons/md";
import { Link } from "@chakra-ui/react";
import type { TFunction } from "i18next";

interface EmptyDashboardProps {
  t: TFunction;
}

export const EmptyDashboard = ({ t }: EmptyDashboardProps) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minH="400px"
      py={32}
    >
      <MdBarChart size={120} color="#D4D5E8" />
      <VStack gap={2} mt={8}>
        <Text fontSize="xl" fontWeight="semibold" color="content.primary">
          {t("empty.title")}
        </Text>
        <Text
          fontSize="md"
          color="content.secondary"
          w="90%"
          textAlign="center"
        >
          {t("empty.description")}{" "}
          <Link href="/" color="content.links" fontWeight="medium">
            {t("empty.goHome")}
          </Link>
        </Text>
      </VStack>
    </Box>
  );
};
