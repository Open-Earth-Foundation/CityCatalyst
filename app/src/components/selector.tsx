import type { TFunction } from "i18next";
import React from "react";
import { Text } from "@chakra-ui/react";
import { NativeSelectField, NativeSelectRoot } from "./ui/native-select";

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
  return (
    <NativeSelectRoot
      width="162px"
      style={{
        fontFamily: "Poppins",
        fontSize: "button.md",
        fontWeight: 600,
        lineHeight: "16px",
        letterSpacing: "1.25px",
        textTransform: "uppercase",
      }}
    >
      <NativeSelectField value={value} onChange={onChange}>
        {options.map((opt) => (
          <option
            key={opt}
            value={opt}
            style={{ textAlign: "left", padding: "8px" }}
          >
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
      </NativeSelectField>
    </NativeSelectRoot>
  );
}
