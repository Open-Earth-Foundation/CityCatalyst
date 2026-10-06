"use client";
import { SimpleGrid, VStack } from "@chakra-ui/react";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";

export interface Field {
  label: string;
  value: string;
}

export interface FieldGridProps {
  fields: Field[];
  columns?: { base: number; md: number };
}

/**
 * Label-above-value pairs on a shared grid, so metadata lines up in columns
 * instead of reflowing into a wrapped run of "Label: value" fragments.
 */
export function FieldGrid({
  fields,
  columns = { base: 2, md: 4 },
}: FieldGridProps) {
  if (fields.length === 0) return null;
  return (
    <SimpleGrid columns={columns} gap="8px 16px">
      {fields.map((field) => (
        <VStack key={field.label} alignItems="flex-start" gap="xs" minW="0">
          <Overline>{field.label}</Overline>
          <BodySmall color="content.primary" wordBreak="break-word">
            {field.value}
          </BodySmall>
        </VStack>
      ))}
    </SimpleGrid>
  );
}
