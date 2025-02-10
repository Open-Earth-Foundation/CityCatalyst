import React from "react";
import { Flex, Text, Badge } from "@chakra-ui/react";
import { getColorForSeries } from "./EmissionsForecastChart";

interface CustomLegendProps {
  data: { id: string; color: string }[];
  t: (key: string) => string;
}

const CustomLegend: React.FC<CustomLegendProps> = ({ data, t }) => {
  return (
    <Flex wrap="wrap" justifyContent="center" marginBottom={4}>
      {data.map((series) => (
        <Flex key={series.id} alignItems="center" mx={2}>
          <Badge boxSize="10px" bg={getColorForSeries(series.id)} mr={2} />
          <Text>{t(series.id)}</Text>
        </Flex>
      ))}
    </Flex>
  );
};

export default CustomLegend;
