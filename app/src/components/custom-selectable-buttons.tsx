import { TFunction } from "i18next";
import { FC } from "react";
import { Button } from "./ui/button";
import { Icon } from "@chakra-ui/react";
import { InventoryButtonCheckIcon } from "./icons";

export default function CustomSelectableButton({
  field,
  value,
  inputValue,
  inputValueFunction,
  t,
}: {
  value: string;
  field: any;
  inputValue: string;
  inputValueFunction: Function;
  t: TFunction;
}) {
  return (
    <Button
      data-testId={`inventory-goal-${value}`}
      key={value}
      w="181px"
      borderColor={
        inputValue === value ? "interactive.secondary" : "border.neutral"
      }
      bg={inputValue === value ? "background.neutral" : "base.light"}
      h="56px"
      color={inputValue === value ? "content.link" : "content.secondary"}
      borderRadius="4xl"
      display="flex"
      justifyContent="center"
      alignItems="center"
      fontFamily="heading"
      fontStyle="500"
      textTransform="uppercase"
      lineHeight="20px"
      gap="8px"
      letterSpacing="wide"
      className="transition-all duration-150"
      borderWidth="1px"
      variant={inputValue === value ? "solid" : "outline"}
      onClick={() => {
        field.onChange(value);
        inputValueFunction(value);
      }}
    >
      {inputValue == value && <Icon as={InventoryButtonCheckIcon} />}
      {t(value)}
    </Button>
  );
}
