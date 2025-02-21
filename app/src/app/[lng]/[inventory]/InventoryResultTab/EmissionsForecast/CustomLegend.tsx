import React from "react";
import { Flex, Text, Badge, Box } from "@chakra-ui/react";
import { getColorForSeries } from "./EmissionsForecastChart";
import { ColoredCircle } from "@/components/ColoredCircle";

interface CustomLegendProps {
  data: { id: string; color: string }[];
  t: (key: string) => string;
}

const CustomLegend: React.FC<CustomLegendProps> = ({ data, t }) => {
  return (
    <Flex wrap="wrap" justifyContent="center" marginBottom={4}>
      {data.map((series) => (
        <Flex key={series.id} alignItems="center" mx={2}>
          <ColoredCircle size="10px" color={getColorForSeries(series.id)} />
          <Text>{t(series.id)}</Text>
        </Flex>
      ))}
    </Flex>
  );
};

export default CustomLegend;
