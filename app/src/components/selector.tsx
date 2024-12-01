import type { TFunction } from "i18next";
import React from "react";
import { Select, Text } from "@chakra-ui/react";

export function Selector<T extends string>({
  value,
  options,
  t,
  onChange,
}: {
  value: T;
  options: T[];
  t: TFunction;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  const selectStyles = {
    fontFamily: "Poppins",
    fontSize: "button.md",
    fontWeight: 600,
    lineHeight: "16px",
    letterSpacing: "1.25px",
    textTransform: "uppercase",
  };

  return (
    <Select
      width="162px"
      value={value}
      onChange={onChange}
      sx={{
        ...selectStyles,
        "& option": {
          ...selectStyles,
          textAlign: "left",
          padding: "8px",
        },
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          <Text
            fontWeight="regular"
            color="interactive.control"
            lineHeight="20"
            letterSpacing="wide"
          >
            {t(opt)}
          </Text>
        </option>
      ))}
    </Select>
  );
}
