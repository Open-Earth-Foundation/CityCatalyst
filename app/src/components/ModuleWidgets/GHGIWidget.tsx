import React from "react";
import { Card, Text } from "@chakra-ui/react";
import { DashboardWidgetProps } from "./types";

export const GHGIWidget: React.FC<DashboardWidgetProps> = ({ 
  moduleId,
  data, 
  error 
}) => {
  return (
    <Card.Root>
      <Card.Header>
        <Text fontWeight="bold">GHGI Module</Text>
      </Card.Header>
      <Card.Body>
        <Text>Module ID: {moduleId}</Text>
        {error && <Text color="red.500">Error: {error}</Text>}
        {data && <Text>Data loaded</Text>}
      </Card.Body>
    </Card.Root>
  );
};