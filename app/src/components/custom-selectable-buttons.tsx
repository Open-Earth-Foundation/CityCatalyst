import { TFunction } from "i18next";
import { Button } from "./ui/button";
import { Icon } from "@chakra-ui/react";
import { InventoryButtonCheckIcon } from "./icons";
import { ControllerRenderProps, FieldValues } from "react-hook-form";

export default function CustomSelectableButton<
  TFieldValues extends FieldValues = FieldValues,
>({
  field,
  value,
  inputValue,
  inputValueFunction,
  t,
}: {
  value: string;
  field: ControllerRenderProps<TFieldValues>;
  inputValue: string;
  inputValueFunction: (value: string) => void;
  t: TFunction;
}) {
  return (
    <Button
      data-testid={`inventory-goal-${value}`}
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
      borderWidth="1px"
      variant={inputValue === value ? "solid" : "outline"}
      style={{ transition: "all 150ms" }}
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
