import { Badge, Box, Card, Radio, Text, useToast } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useState } from "react";
import type { Methodology } from "@/util/form-schema";
import { InfoIcon } from "@chakra-ui/icons";

interface MethodologyCardProps {
  id: string;
  inputRequired?: string[];
  isSelected: boolean;
  t: TFunction;
  disabled: boolean;
  handleCardSelect: (methodologyId: Methodology) => void;
}

const MethodologyCard: FC<MethodologyCardProps> = ({
  id,
  inputRequired,
  disabled,
  t,
  handleCardSelect = (_methodology: Methodology) => {},
}) => {
  const [isSelected, setIsSelected] = useState(false);
  const handleRadioChange = () => {
    setIsSelected(true);
    handleCardSelect({
      disabled,
      inputRequired,
      id: id,
    });
  };

  const toast = useToast();

  const handleCardClick = () => {
    if (disabled) {
      toast({
        status: "error",
        title: t("selected-methodology-disabled"),
        render: ({ title }) => (
          <Box
            h="48px"
            w="600px"
            borderRadius="8px"
            display="flex"
            alignItems="center"
            color="white"
            backgroundColor="content.alternative"
            gap="8px"
            px="16px"
          >
            <InfoIcon />
            <Text>{title}</Text>
          </Box>
        ),
      });
      return;
    }
    if (!isSelected) {
      handleCardSelect({
        disabled,
        inputRequired,
        id: id,
      });
    }
    setIsSelected(!isSelected);
  };
  const isMethodologyDisabled = disabled;
  return (
    <Card
      data-testid="methodology-card"
      borderWidth="1px"
      borderRadius="8px"
      flexDirection="column"
      borderColor="border.overlay"
      p="24px"
      gap="16px"
      shadow="none"
      display="flex"
      opacity={isMethodologyDisabled ? ".7" : ""}
      h="auto"
      onClick={handleCardClick}
      _hover={{
        shadow: isMethodologyDisabled ? "none" : "md",
        cursor: isMethodologyDisabled ? "not-allowed" : "pointer",
      }}
      backgroundColor={isSelected ? "gray.200" : "white"}
    >
      <Box w="full" display="flex" justifyContent="space-between">
        <Radio
          disabled={isMethodologyDisabled}
          isChecked={isSelected}
          onChange={handleRadioChange}
        />{" "}
        {isMethodologyDisabled ? (
          <Badge
            borderWidth="1px"
            borderColor="border.neutral"
            py="4px"
            px="8px"
            borderRadius="full"
            textColor={"content.secondary"}
            fontSize="body.sm"
            bg="base.light"
          >
            {t("coming-soon")}
          </Badge>
        ) : (
          ""
        )}
      </Box>
      <Text
        data-testid="methodology-card-header"
        fontWeight="bold"
        fontSize="title.md"
        fontFamily="heading"
      >
        {t(id)}
      </Text>
      <Text
        letterSpacing="wide"
        fontSize="body.md"
        fontWeight="normal"
        color="interactive.control"
      >
        {t(id + "-description")}
      </Text>
      <Text
        letterSpacing="wide"
        fontSize="body.sm"
        fontWeight="medium"
        color="interactive.control"
        fontFamily="heading"
      >
        {t("input-required")}
      </Text>
      <Box
        pl="22px"
        letterSpacing="wide"
        fontSize="body.lg"
        fontWeight="normal"
        color="interactive.control"
      >
        {inputRequired?.map((item: string, i: number) => (
          <li key={i}>
            <Text
              letterSpacing="wide"
              display="inline"
              fontSize="body.sm"
              color="interactive.control"
              fontFamily="heading"
            >
              {t(item)}
            </Text>
          </li>
        ))}
      </Box>
    </Card>
  );
};

export default MethodologyCard;
