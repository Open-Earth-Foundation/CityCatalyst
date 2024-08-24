import { Badge, Box, Card, Radio, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useState } from "react";
import type { Methodology } from "@/util/form-schema";

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

  const handleCardClick = () => {
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
      w="248px"
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
            bg="base.light"
          >
            {t("coming-soon")}
          </Badge>
        ) : (
          ""
        )}
      </Box>
      <Text data-testid="methodology-card-header" fontWeight="bold" fontSize="title.md" fontFamily="heading">
        {t(id)}
      </Text>
      <Text
        letterSpacing="wide"
        fontSize="body.lg"
        fontWeight="normal"
        color="interactive.control"
      >
        {t(id + "-description")}
      </Text>
      <Text
        letterSpacing="wide"
        fontSize="body.lg"
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
          <li key={i}>{t(item)}</li>
        ))}
      </Box>
    </Card>
  );
};

export default MethodologyCard;
