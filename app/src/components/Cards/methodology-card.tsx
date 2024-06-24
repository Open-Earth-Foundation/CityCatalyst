import { Badge, Box, Card, Radio, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useState } from "react";

interface MethodologyCardProps {
  name: string;
  description: string;
  inputRequired: string[];
  isSelected: boolean;
  disabled: boolean;
  t: TFunction;
  handleCardSelect: (methodologyName: string) => void;
}

const MethodologyCard: FC<MethodologyCardProps> = ({
  name,
  description,
  inputRequired,
  disabled,
  t,
  handleCardSelect = (_methodologyName: string) => {},
}) => {
  const [isSelected, setIsSelected] = useState(false);
  const handleRadioChange = () => {
    setIsSelected(true);
    handleCardSelect(name);
  };

  const handleCardClick = () => {
    if (!isSelected) {
      handleCardSelect(name);
    }
    setIsSelected(!isSelected);
  };
  return (
    <Card
      borderWidth="1px"
      borderRadius="8px"
      flexDirection="column"
      borderColor="border.overlay"
      p="24px"
      gap="16px"
      shadow="none"
      display="flex"
      opacity={disabled ? ".7" : ""}
      h="auto"
      w="248px"
      onClick={handleCardClick}
      _hover={{
        shadow: disabled ? "none" : "md",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      backgroundColor={isSelected ? "gray.200" : "white"}
    >
      <Box w="full" display="flex" justifyContent="space-between">
        <Radio
          disabled={disabled}
          isChecked={isSelected}
          onChange={handleRadioChange}
        />{" "}
        {disabled ? (
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
      <Text fontWeight="bold" fontSize="title.md" fontFamily="heading">
        {name}
      </Text>
      <Text
        letterSpacing="wide"
        fontSize="body.lg"
        fontWeight="normal"
        color="interactive.control"
      >
        {description}
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
        {inputRequired.map((item: string, i: number) => (
          <li key={i}>{item}</li>
        ))}
      </Box>
    </Card>
  );
};

export default MethodologyCard;
