import React from "react";
import { Box, Text } from "@chakra-ui/react";
import { getColorForSeries } from "./EmissionsForecastChart";

interface CustomLegendProps {
  data: { id: string; color: string }[];
  t: (key: string) => string;
}

const CustomLegend: React.FC<CustomLegendProps> = ({ data, t }) => {
  return (
    <Box>
      <Text
        color="content.secondary"
        fontSize="label.large"
        textTransform="capitalize"
        fontWeight="500"
      >
        {t("legend")}
      </Text>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="flex-start"
        flexWrap="wrap"
        mt={3}
        gap={2}
      >
        {data.map((series) => (
          <Box
            key={series.id}
            backgroundColor="background.neutral"
            borderRadius="50px"
            display="flex"
            justifyContent="center"
            alignItems="center"
            px={3}
            py={1.5}
            mr={4}
          >
            <Box
              boxSize="4"
              style={{ backgroundColor: getColorForSeries(series.id) }}
            />
            <Text fontSize="body.md" ml={2} color="content.alternative">
              {t(series.id)}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default CustomLegend;
