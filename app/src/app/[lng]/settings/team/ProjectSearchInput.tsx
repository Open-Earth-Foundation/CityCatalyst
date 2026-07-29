"use client";

import { Icon, Input } from "@chakra-ui/react";
import { MdSearch } from "react-icons/md";
import { InputGroup } from "@/components/ui/input-group";
import { TFunction } from "i18next";

interface ProjectSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  t: TFunction;
}

/** Search input used to filter projects in the Teams settings sidebar. */
export default function ProjectSearchInput({
  value,
  onChange,
  t,
}: ProjectSearchInputProps) {
  return (
    <InputGroup
      w="full"
      height="48px"
      alignItems="center"
      display="flex"
      borderRadius="4px"
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.neutral"
      startElement={
        <Icon
          as={MdSearch}
          color="content.tertiary"
          display="flex"
          pointerEvents="none"
          alignItems="center"
          size="md"
        />
      }
    >
      <Input
        type="search"
        fontSize="body.md"
        fontFamily="heading"
        letterSpacing="wide"
        color="content.primary"
        placeholder={t("search-by-project")}
        border="none"
        h="100%"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        _placeholder={{ color: "content.tertiary" }}
      />
    </InputGroup>
  );
}
