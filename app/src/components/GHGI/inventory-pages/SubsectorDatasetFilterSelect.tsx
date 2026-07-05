"use client";

import { Icon, Portal, Select, type ListCollection } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { MdArrowDropDown } from "react-icons/md";

type SubsectorFilterOption = {
  label: string;
  value: string;
};

type SubsectorDatasetFilterSelectProps = {
  collection: ListCollection<SubsectorFilterOption>;
  value: string[];
  onValueChange: (value: string[]) => void;
  t: TFunction;
};

/** Subsector filter dropdown for third-party dataset cards on add-data steps. */
export function SubsectorDatasetFilterSelect({
  collection,
  value,
  onValueChange,
  t,
}: SubsectorDatasetFilterSelectProps) {
  return (
    <Select.Root
      collection={collection}
      size="sm"
      width="320px"
      value={value}
      onValueChange={(event) => onValueChange(event.value)}
    >
      <Select.HiddenSelect />
      <Select.Label
        fontFamily="heading"
        fontWeight="semibold"
        fontSize="label.lg"
      >
        {t("filter-by-subsector")}
      </Select.Label>
      <Select.Control>
        <Select.Trigger
          p="12px 16px"
          borderRadius="4px"
          border="1px solid"
          borderColor="border.neutral"
        >
          <Select.ValueText placeholder={t("select-subsector")} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator>
            <Icon as={MdArrowDropDown} boxSize={6} />
          </Select.Indicator>
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content gap="12px">
            {collection.items.map((item) => (
              <Select.Item item={item} key={item.value}>
                {item.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
