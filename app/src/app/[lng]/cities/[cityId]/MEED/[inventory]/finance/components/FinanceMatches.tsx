"use client";
import { useMemo, useState, type ElementType } from "react";
import { Box, Card, HStack, Icon, Separator, VStack } from "@chakra-ui/react";
import { LuInbox, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import { useGetMeedFinanceLinkQuery } from "@/services/api";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedButton } from "../../../components/MeedButton";
import { MeedCardSkeleton } from "../../../components/MeedSkeletons";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import {
  FOCUS_RING,
  fundAccessLabelKey,
  isSelfFundable,
  withLimit,
} from "../labels";
import {
  extractLinkedList,
  type FeasibilityRow,
  type Opportunity,
  type Project,
} from "../types";
import { OpportunityCard } from "./OpportunityCard";
import { ProjectCard } from "./ProjectCard";

const INITIAL_OPPS = 2;
const INITIAL_PROJECTS = 3;

function DetailEmpty({
  title,
  body,
  icon = LuInbox,
}: {
  title: string;
  body: string;
  icon?: ElementType;
}) {
  return (
    <Card.Root borderColor="border.neutral">
      <Card.Body py="l" px="m">
        <VStack gap="s" textAlign="center" maxW="360px" mx="auto">
          <Icon as={icon} boxSize="24px" color="content.tertiary" />
          <LabelLarge color="content.primary">{title}</LabelLarge>
          <Caption>{body}</Caption>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export interface FinanceMatchesProps {
  row: FeasibilityRow;
  cityId: string;
  t: TFunction;
}

/**
 * Funding opportunities and funded projects matched to one feasibility row,
 * lazily fetched via the row's relative Global-API links. Shared by the
 * finance table's expanded row and the results action drawer.
 */
export function FinanceMatches({ row, cityId, t }: FinanceMatchesProps) {
  const [showAllOpps, setShowAllOpps] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const oppLink = row.links?.opportunities;
  const projLink = row.links?.projects;

  const {
    data: oppData,
    isLoading: oppsLoading,
    isError: oppsError,
  } = useGetMeedFinanceLinkQuery(
    { cityId, link: oppLink ?? "" },
    { skip: !oppLink },
  );
  const {
    data: projData,
    isLoading: projectsLoading,
    isError: projectsError,
  } = useGetMeedFinanceLinkQuery(
    { cityId, link: projLink ? withLimit(projLink, 50) : "" },
    { skip: !projLink },
  );

  const opportunities = useMemo(
    () => extractLinkedList<Opportunity>(oppData),
    [oppData],
  );
  const projects = useMemo(
    () => extractLinkedList<Project>(projData),
    [projData],
  );

  const selfFundable = isSelfFundable(row.route);

  const visibleOpps = showAllOpps
    ? opportunities.rows
    : opportunities.rows.slice(0, INITIAL_OPPS);
  const visibleProjects = showAllProjects
    ? projects.rows
    : projects.rows.slice(0, INITIAL_PROJECTS);

  return (
    <>
      {/* Funding opportunities */}
      <VStack alignItems="stretch" gap="s">
        <HStack justifyContent="space-between" gap="s">
          <Overline>{t("fund-access-title")}</Overline>
          {selfFundable ? (
            <MeedStatusTag tone="positive">
              {t("fundable-own-budget")}
            </MeedStatusTag>
          ) : (
            opportunities.rows.length > 0 && (
              <MeedStatusTag tone="neutral">
                {t(fundAccessLabelKey(row.inputs?.finance?.fund_access), {
                  n:
                    row.inputs?.finance?.n_reachable_opportunities ??
                    opportunities.total,
                })}
              </MeedStatusTag>
            )
          )}
        </HStack>

        {selfFundable && (
          <Box
            bg="sentiment.positiveOverlay"
            borderRadius="rounded"
            px="m"
            py="s"
          >
            <BodySmall color="content.secondary">
              {t("self-fundable-note")}
            </BodySmall>
          </Box>
        )}

        {oppsLoading ? (
          <MeedCardSkeleton lines={2} />
        ) : oppsError ? (
          <DetailEmpty
            icon={LuTriangleAlert}
            title={t("finance-load-error-title")}
            body={t("finance-load-error-body")}
          />
        ) : opportunities.rows.length === 0 ? (
          <DetailEmpty
            title={t("no-opportunities-title")}
            body={t("no-opportunities-body")}
          />
        ) : (
          <>
            {visibleOpps.map((opp, i) => (
              <OpportunityCard key={`opp-${i}`} opp={opp} t={t} />
            ))}
            {opportunities.rows.length > INITIAL_OPPS && (
              <MeedButton
                variant="text"
                alignSelf="flex-start"
                minW="auto"
                h="32px"
                px="s"
                onClick={() => setShowAllOpps((v) => !v)}
                _focusVisible={FOCUS_RING}
              >
                {showAllOpps
                  ? t("show-fewer-funds")
                  : t("show-all-funds", { n: opportunities.rows.length })}
              </MeedButton>
            )}
          </>
        )}
      </VStack>

      <Separator borderColor="border.overlay" />

      {/* Matched projects */}
      <VStack alignItems="stretch" gap="s">
        <HStack justifyContent="space-between" gap="s">
          <Overline>{t("matched-projects-title")}</Overline>
          {!projectsLoading && projects.rows.length > 0 && (
            <MeedStatusTag tone="neutral">
              {t("projects-total", { n: projects.total })}
            </MeedStatusTag>
          )}
        </HStack>

        {projectsLoading ? (
          <MeedCardSkeleton lines={2} />
        ) : projectsError ? (
          <DetailEmpty
            icon={LuTriangleAlert}
            title={t("finance-load-error-title")}
            body={t("finance-load-error-body")}
          />
        ) : projects.rows.length === 0 ? (
          <DetailEmpty
            title={t("no-projects-title")}
            body={t("no-projects-body")}
          />
        ) : (
          <>
            {visibleProjects.map((proj, i) => (
              <ProjectCard key={`proj-${i}`} proj={proj} t={t} />
            ))}
            {projects.rows.length > INITIAL_PROJECTS && (
              <MeedButton
                variant="text"
                alignSelf="flex-start"
                minW="auto"
                h="32px"
                px="s"
                onClick={() => setShowAllProjects((v) => !v)}
                _focusVisible={FOCUS_RING}
              >
                {showAllProjects
                  ? t("show-fewer-projects")
                  : t("show-all-projects", { n: projects.rows.length })}
              </MeedButton>
            )}
            {projects.total > projects.rows.length && (
              <Caption>
                {t("projects-page-note", {
                  shown: projects.rows.length,
                  total: projects.total,
                })}
              </Caption>
            )}
          </>
        )}
      </VStack>
    </>
  );
}
