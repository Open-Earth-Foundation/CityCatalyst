"use client";
import { Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuMapPin } from "react-icons/lu";
import type { TFunction } from "i18next";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import {
  confidenceMeta,
  formatClpMillions,
  humanizeEnum,
  lifecycleTone,
} from "../labels";
import type { Project } from "../types";
import { FieldGrid, type Field } from "./FieldGrid";

export interface ProjectCardProps {
  proj: Project;
  t: TFunction;
}

/** One funded project matched to the action. */
export function ProjectCard({ proj, t }: ProjectCardProps) {
  const conf = proj.action_matches?.[0]
    ? confidenceMeta(proj.action_matches[0].confidence)
    : null;
  const cost = formatClpMillions(proj.cost_total, t);
  const funder = proj.funding_sources?.[0]?.funder_name;
  const name =
    proj.project_name_i18n?.en ??
    proj.project_name ??
    t("project-fallback-name");

  const fields: Field[] = [];
  if (cost) fields.push({ label: t("field-cost"), value: cost });
  if (proj.sector) {
    fields.push({ label: t("field-sector"), value: humanizeEnum(proj.sector) });
  }
  if (proj.funding_channel) {
    fields.push({
      label: t("field-channel"),
      value: humanizeEnum(proj.funding_channel),
    });
  }
  if (funder) fields.push({ label: t("field-funder"), value: funder });

  return (
    <Card.Root borderColor="border.neutral">
      <Card.Body p="12px">
        <VStack alignItems="stretch" gap="8px">
          <HStack
            justifyContent="space-between"
            alignItems="flex-start"
            gap="8px"
          >
            <LabelLarge color="content.primary" wordBreak="break-word">
              {name}
            </LabelLarge>
            <HStack gap="4px" flexShrink={0}>
              {conf && (
                <MeedStatusTag tone={conf.tone}>
                  {t(conf.labelKey)}
                </MeedStatusTag>
              )}
              {proj.lifecycle_stage && (
                <MeedStatusTag tone={lifecycleTone(proj.lifecycle_stage)}>
                  {humanizeEnum(proj.lifecycle_stage)}
                </MeedStatusTag>
              )}
            </HStack>
          </HStack>
          {proj.jurisdiction && (
            <HStack gap="4px">
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
