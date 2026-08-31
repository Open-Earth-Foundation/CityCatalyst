"use client";
import { useMemo, useState } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  Separator,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import { LuInbox } from "react-icons/lu";
import type { TFunction } from "i18next";
import { useGetMeedFinanceLinkQuery } from "@/services/api";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedButton } from "../../../components/MeedButton";
import { MeedCardSkeleton } from "../../../components/MeedSkeletons";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import {
  FOCUS_RING,
  isSelfFundable,
  numericToLevel,
  profileAttrs,
  withLimit,
} from "../labels";
import {
  extractLinkedList,
  type FeasibilityRow,
  type Opportunity,
  type Project,
} from "../types";
import { LevelMeter } from "./LevelMeter";
import { OpportunityCard } from "./OpportunityCard";
import { ProjectCard } from "./ProjectCard";

const INITIAL_OPPS = 2;
const INITIAL_PROJECTS = 3;

function DetailEmpty({ title, body }: { title: string; body: string }) {
  return (
    <Card.Root borderColor="border.neutral">
      <Card.Body py="l" px="m">
        <VStack gap="s" textAlign="center" maxW="360px" mx="auto">
          <Icon as={LuInbox} boxSize="24px" color="content.tertiary" />
          <LabelLarge color="content.primary">{title}</LabelLarge>
          <Caption>{body}</Caption>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export interface RowDetailProps {
  row: FeasibilityRow;
  cityId: string;
  cityName: string;
  t: TFunction;
}

/**
 * Detail for an expanded feasibility row: route reasoning, factor breakdown,
 * and lazily-fetched funding opportunities and funded projects (via the row's
 * relative Global-API links).
 */
export function RowDetail({ row, cityId, cityName, t }: RowDetailProps) {
  const [showAllOpps, setShowAllOpps] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const oppLink = row.links?.opportunities;
  const projLink = row.links?.projects;

  const { data: oppData, isLoading: oppsLoading } = useGetMeedFinanceLinkQuery(
    { cityId, link: oppLink ?? "" },
    { skip: !oppLink },
  );
  const { data: projData, isLoading: projectsLoading } =
    useGetMeedFinanceLinkQuery(
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
  const inputs = row.inputs ?? {};
  const ciLevel = numericToLevel(inputs.action?.capital_intensity);
  const pcLevel = numericToLevel(inputs.action?.preparation_complexity);
  const profile = profileAttrs(inputs.city?.profile);

  const visibleOpps = showAllOpps
    ? opportunities.rows
    : opportunities.rows.slice(0, INITIAL_OPPS);
  const visibleProjects = showAllProjects
    ? projects.rows
    : projects.rows.slice(0, INITIAL_PROJECTS);

  return (
    <VStack alignItems="stretch" gap="m" px="l" py="m">
      {row.reason && (
        <BodyMedium color="content.secondary">{row.reason}</BodyMedium>
      )}

      {(ciLevel || pcLevel || profile.fa || profile.dc) && (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="l">
          {(ciLevel || pcLevel) && (
            <VStack alignItems="stretch" gap="m">
              <Overline>{t("what-action-needs")}</Overline>
              {ciLevel && (
                <LevelMeter
                  label={t("factor-capital-intensity")}
                  level={ciLevel}
                  dir="needs"
                  t={t}
                />
              )}
              {pcLevel && (
                <LevelMeter
                  label={t("factor-preparation-complexity")}
                  level={pcLevel}
                  dir="needs"
                  t={t}
                />
              )}
            </VStack>
          )}
          {(profile.fa || profile.dc) && (
            <VStack alignItems="stretch" gap="m">
              <Overline>{t("what-city-has", { city: cityName })}</Overline>
              {profile.fa && (
                <LevelMeter
                  label={t("factor-financial-autonomy")}
                  level={profile.fa}
                  dir="has"
                  t={t}
                />
              )}
              {profile.dc && (
                <LevelMeter
                  label={t("factor-delivery-capacity")}
                  level={profile.dc}
                  dir="has"
                  t={t}
                />
              )}
            </VStack>
          )}
        </SimpleGrid>
      )}

      <Separator borderColor="border.overlay" />

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
                {t("direct-funds-count", {
                  n:
                    inputs.finance?.n_reachable_opportunities ??
                    opportunities.rows.length,
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
    </VStack>
  );
}
