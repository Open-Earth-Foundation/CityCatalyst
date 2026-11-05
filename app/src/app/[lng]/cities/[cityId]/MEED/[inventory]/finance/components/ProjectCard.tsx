"use client";
import { Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuMapPin } from "react-icons/lu";
import type { TFunction } from "i18next";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import {
  CHANNEL_KEYS,
  confidenceMeta,
  enumLabel,
  formatClpAmount,
  LIFECYCLE_KEYS,
  lifecycleTone,
  projectName,
  SECTOR_KEYS,
} from "../labels";
import type { Project } from "../types";
import { FieldGrid, type Field } from "./FieldGrid";

export interface ProjectCardProps {
  proj: Project;
  t: TFunction;
  /** Page language, for the project's translated name. */
  lng?: string;
}

/** One funded project matched to the action. */
export function ProjectCard({ proj, t, lng }: ProjectCardProps) {
  const conf = proj.action_matches?.[0]
    ? confidenceMeta(proj.action_matches[0].confidence)
    : null;
  const cost = formatClpAmount(proj.cost_total, proj.amount_unit, t);
  const funder = proj.funding_sources?.[0]?.funder_name;
  const name = projectName(proj, lng, t("project-fallback-name"));

  const fields: Field[] = [];
  if (cost) fields.push({ label: t("field-cost"), value: cost });
  if (proj.sector) {
    fields.push({
      label: t("field-sector"),
      value: enumLabel(SECTOR_KEYS, proj.sector, t),
    });
  }
  if (proj.funding_channel) {
    fields.push({
      label: t("field-channel"),
      value: enumLabel(CHANNEL_KEYS, proj.funding_channel, t),
    });
  }
  if (funder) fields.push({ label: t("field-funder"), value: funder });

  return (
    <Card.Root borderColor="border.neutral">
      <Card.Body p="m">
        <VStack alignItems="stretch" gap="s">
          <HStack
            justifyContent="space-between"
            alignItems="flex-start"
            gap="s"
          >
            <LabelLarge color="content.primary" wordBreak="break-word">
              {name}
            </LabelLarge>
            <HStack gap="xs" flexShrink={0}>
              {conf && (
                <MeedStatusTag tone={conf.tone}>
                  {t(conf.labelKey)}
                </MeedStatusTag>
              )}
              {proj.lifecycle_stage && (
                <MeedStatusTag tone={lifecycleTone(proj.lifecycle_stage)}>
                  {enumLabel(LIFECYCLE_KEYS, proj.lifecycle_stage, t)}
                </MeedStatusTag>
              )}
            </HStack>
          </HStack>
          {proj.jurisdiction && (
            <HStack gap="xs">
              <Icon as={LuMapPin} boxSize="12px" color="content.tertiary" />
              <Caption>{proj.jurisdiction}</Caption>
            </HStack>
          )}
          <FieldGrid fields={fields} />
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
