"use client";
import React from "react";
import {
  Box,
  Card,
  Grid,
  GridItem,
  HStack,
  Icon,
  VStack,
} from "@chakra-ui/react";
import type { IconType } from "react-icons";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";

export interface SummaryLine {
  icon: IconType;
  text: string;
}

/**
 * Same layout as `MeedRankingSummary` — inputs as tags on the left, key
 * insights on the right, configuration row below — but the lines come in as
 * props, because the adaptation insights are about risk cells rather than
 * emitting sectors and the mitigation component derives its own.
 */
export function DemoRankingSummary({
  inputs,
  lines,
  t,
  config,
}: {
  inputs: string[];
  lines: SummaryLine[];
  t: TFunction;
  config?: React.ReactNode;
}) {
  return (
    <Card.Root borderColor="border.overlay">
      <Card.Body>
        <VStack alignItems="stretch" gap="m">
          <Grid templateColumns={{ base: "1fr", md: "1fr 2fr" }} gap="l">
            <GridItem>
              <VStack alignItems="stretch" gap="s">
                <Overline color="content.tertiary">
                  {t("summary-inputs-heading")}
                </Overline>
                <HStack gap="xs" flexWrap="wrap">
                  {inputs.map((input) => (
                    <MeedStatusTag key={input} tone="neutral">
                      {input}
                    </MeedStatusTag>
                  ))}
                </HStack>
              </VStack>
            </GridItem>
            <GridItem>
              <VStack alignItems="stretch" gap="s">
                <Overline color="content.tertiary">
                  {t("summary-insights-title")}
                </Overline>
                <VStack alignItems="stretch" gap="s">
                  {lines.map((line, i) => (
                    <HStack key={i} gap="s" alignItems="flex-start">
                      <Icon
                        as={line.icon}
                        boxSize="16px"
                        color="content.link"
                        mt="3px"
                        flexShrink={0}
                      />
                      <BodyMedium color="content.secondary">
                        {line.text}
                      </BodyMedium>
                    </HStack>
                  ))}
                </VStack>
              </VStack>
            </GridItem>
          </Grid>
          {config && (
            <Box borderTopWidth="1px" borderColor="border.overlay" pt="m">
              {config}
            </Box>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export function SummaryTitle({ children }: { children: React.ReactNode }) {
  return <TitleMedium color="content.primary">{children}</TitleMedium>;
}
