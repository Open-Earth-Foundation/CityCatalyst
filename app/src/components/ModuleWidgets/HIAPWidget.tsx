import React from "react";
import { Card, Text } from "@chakra-ui/react";
import { DashboardWidgetProps } from "./types";
import { useTranslation } from "@/i18n/client";

export const HIAPWidget: React.FC<DashboardWidgetProps> = ({ 
  moduleId,
  data, 
  error 
}) => {
  const { t } = useTranslation("en", "dashboard");
  
  return (
    <Card.Root>
      <Card.Header>
        <Text fontWeight="bold">{t("hiap-module")}</Text>
      </Card.Header>
      <Card.Body>
        <Text>{t("module-id")}: {moduleId}</Text>
        {error && <Text color="red.500">{t("error")}: {error}</Text>}
        {data && <Text>{t("data-loaded")}</Text>}
      </Card.Body>
    </Card.Root>
  );
};