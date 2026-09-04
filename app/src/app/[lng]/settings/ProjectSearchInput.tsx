"use client";

import { Icon, Input } from "@chakra-ui/react";
import { MdSearch } from "react-icons/md";
import { InputGroup } from "@/components/ui/input-group";
import { TFunction } from "i18next";

interface ProjectSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  t: TFunction;
  /** Optional bottom margin for layout spacing (e.g. projects tab). */
  mb?: string | number;
}

/** Shared search input used to filter projects in Settings tabs. */
export default function ProjectSearchInput({
  value,
  onChange,
  t,
  mb,
}: ProjectSearchInputProps) {
  return (
    <InputGroup
      mb={mb}
      w="full"
      startElement={<Icon as={MdSearch} size="md" />}
    >
      <Input
        type="search"
        placeholder={t("search-by-project")}
        borderRadius="4px"
        borderWidth="1px"
        borderColor="border.neutral"
        shadow="sm"
        bg="base.light"
        size="lg"
        w="full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputGroup>
  );
}
