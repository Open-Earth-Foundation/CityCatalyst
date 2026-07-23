import type { TFunction } from "i18next";
import React, { useEffect } from "react";
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
  const { data: organizations, isLoading } = api.useGetUserOrganizationsQuery();

  // auto-select first organization when loaded
  useEffect(() => {
    if (!value && !isLoading && organizations && organizations.length > 0) {
      onValueChange(organizations?.[0].organizationId);
    }
  }, [isLoading, onValueChange, value, organizations]);

  return (
    <NativeSelectRoot
      mb={4}
      width="300px"
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
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          onValueChange(event.target.value)
        }
        placeholder={isLoading ? t("loading") : undefined}
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
