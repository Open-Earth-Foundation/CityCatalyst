import type { TFunction } from "i18next";
import React from "react";
import { chakra } from "@chakra-ui/react";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { api } from "@/services/api";

export function OrganizationSelector({
  value,
  onValueChange,
  t,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  t: TFunction;
}) {
  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) =>
    onValueChange(event.target.value);

  const { data: organizations, isLoading } = api.useGetUserOrganizationsQuery();

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
      <NativeSelectField
        value={value}
        onChange={onChange}
        placeholder={isLoading ? t("loading") : t("select-organization")}
      >
        {organizations?.map(({ organizationId, name }) => (
          <chakra.option
            key={organizationId}
            value={organizationId}
            textAlign="left"
            padding="8px"
            fontWeight="regular"
            color="interactive.control"
            lineHeight="20"
            letterSpacing="wide"
          >
            {name}
          </chakra.option>
        ))}
      </NativeSelectField>
    </NativeSelectRoot>
  );
}
