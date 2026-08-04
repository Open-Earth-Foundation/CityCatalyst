"use client";
import React, { useState } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  SimpleGrid,
  Tag,
  VStack,
} from "@chakra-ui/react";
import {
  LuCircleCheck,
  LuCircleX,
  LuScale,
  LuTriangleAlert,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import type { MeedPrioritizeCityResult } from "@/util/types/meed";
import { BodyLarge, BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { TitleMedium } from "@/components/package/Texts/Title";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { MeedWizardPage } from "../../MeedWizardPage";

/**
 * One action from the legal screening output of the prioritization run.
 * Local view type until the hiap-meed service layer exposes the screening
 * result alongside `MeedPrioritizeCityResult`.
 */
interface LegalScreenedAction {
  actionId: string;
  actionName: string;
  sector?: string | null;
  reasons?: string[];
}

function SummaryCard({
  count,
  label,
  sublabel,
  icon,
  countColor,
}: {
  count: number;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  countColor: string;
}) {
  return (
    <Card.Root>
      <Card.Body>
        <VStack alignItems="flex-start" gap="4px">
          <HStack gap="8px" alignItems="baseline">
            <BodyLarge
              color={countColor}
              fontWeight="bold"
              fontSize="28px"
              fontVariantNumeric="tabular-nums"
            >
              {count}
            </BodyLarge>
            <Icon as={icon} boxSize="16px" color={countColor} />
          </HStack>
          <LabelLarge color="content.primary">{label}</LabelLarge>
          <BodySmall color="content.secondary">{sublabel}</BodySmall>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function BlockedActionCard({
  action,
  t,
}: {
  action: LegalScreenedAction;
  t: TFunction;
}) {
  return (
    <Card.Root>
      <Card.Body>
        <VStack alignItems="stretch" gap="8px">
          <HStack gap="8px" flexWrap="wrap">
            <BodyMedium color="content.primary" fontWeight="bold" flex="1">
              {action.actionName}
            </BodyMedium>
            {action.sector && (
              <Tag.Root colorPalette="gray" size="sm">
                <Tag.Label>{action.sector.replace(/_/g, " ")}</Tag.Label>
              </Tag.Root>
            )}
            <Tag.Root colorPalette="red" size="sm">
              <Tag.Label>{t("excluded-tag")}</Tag.Label>
            </Tag.Root>
          </HStack>
          {action.reasons && action.reasons.length > 0 && (
            <VStack alignItems="stretch" gap="4px">
              <LabelMedium color="content.tertiary">
                {t("reasons-label")}
              </LabelMedium>
              {action.reasons.map((reason, i) => (
                <BodySmall key={i} color="content.secondary">
                  {reason}
                </BodySmall>
              ))}
            </VStack>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function FlaggedActionCard({
  action,
  t,
}: {
  action: LegalScreenedAction;
  t: TFunction;
}) {
  return (
    <Card.Root>
      <Card.Body>
        <VStack alignItems="stretch" gap="8px">
          <HStack gap="8px" flexWrap="wrap">
            <BodyMedium color="content.primary" fontWeight="bold" flex="1">
              {action.actionName}
            </BodyMedium>
            {action.sector && (
              <Tag.Root colorPalette="gray" size="sm">
                <Tag.Label>{action.sector.replace(/_/g, " ")}</Tag.Label>
              </Tag.Root>
            )}
            <Tag.Root colorPalette="orange" size="sm">
              <Tag.Label>{t("flagged-tag")}</Tag.Label>
            </Tag.Root>
          </HStack>
          <BodySmall color="content.secondary">
            {t("flagged-card-body")}
          </BodySmall>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function RegulationsContent({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, "meed-regulations");

  // TODO(meed backend): replace with the stored prioritization result and its
  // legal screening output once the hiap-meed service layer lands (contract
  // types in @/util/types/meed). Until then the precondition card renders and
  // the user can continue to the next step.
  const [ranking] = useState<MeedPrioritizeCityResult | null>(null);
  const blocked: LegalScreenedAction[] = [];
  const flagged: LegalScreenedAction[] = [];
  const includedCount =
    ranking?.ranked_actions?.length ?? ranking?.ranked_action_ids?.length ?? 0;

  return (
    <VStack alignItems="stretch" gap="24px">
      <BodyLarge color="content.secondary">{t("intro")}</BodyLarge>

      <HStack
        gap="8px"
        bg="background.neutral"
        borderRadius="6px"
        px="12px"
        py="6px"
        alignSelf="flex-start"
      >
        <Icon as={LuScale} boxSize="14px" color="content.secondary" />
        <LabelMedium color="content.secondary">
          {t("feasibility-note")}
        </LabelMedium>
      </HStack>

      {!ranking ? (
        <Card.Root>
          <Card.Body>
            <VStack gap="12px" py="40px" px="24px" textAlign="center">
              <Icon as={LuScale} boxSize="32px" color="content.tertiary" />
              <TitleMedium color="content.primary">
                {t("precondition-title")}
              </TitleMedium>
              <BodyMedium color="content.secondary" maxW="520px">
                {t("precondition-body")}
              </BodyMedium>
            </VStack>
          </Card.Body>
        </Card.Root>
      ) : (
        <>
          <SimpleGrid columns={{ base: 1, md: 3 }} gap="12px">
            <SummaryCard
              count={includedCount}
              label={t("summary-included")}
              sublabel={t("summary-included-sub")}
              icon={LuCircleCheck}
              countColor="sentiment.positiveDefault"
            />
            <SummaryCard
              count={blocked.length}
              label={t("summary-blocked")}
              sublabel={t("summary-blocked-sub")}
              icon={LuCircleX}
              countColor="sentiment.negativeDefault"
            />
            <SummaryCard
              count={flagged.length}
              label={t("summary-flagged")}
              sublabel={t("summary-flagged-sub")}
              icon={LuTriangleAlert}
              countColor="sentiment.warningDefault"
            />
          </SimpleGrid>

          {blocked.length === 0 && flagged.length === 0 && (
            <Card.Root>
              <Card.Body>
                <VStack gap="10px" py="28px" px="24px" textAlign="center">
                  <Icon
                    as={LuCircleCheck}
                    boxSize="28px"
                    color="sentiment.positiveDefault"
                  />
                  <TitleMedium color="content.primary">
                    {t("all-passed-title")}
                  </TitleMedium>
                  <BodyMedium color="content.secondary">
                    {t("all-passed-body")}
                  </BodyMedium>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          {blocked.length > 0 && (
            <VStack alignItems="stretch" gap="12px">
              <Box>
                <TitleMedium color="content.primary">
                  {t("blocked-section-title", { count: blocked.length })}
                </TitleMedium>
                <BodySmall color="content.secondary" mt="4px">
                  {t("blocked-section-description")}
                </BodySmall>
              </Box>
              {blocked.map((action) => (
                <BlockedActionCard key={action.actionId} action={action} t={t} />
              ))}
            </VStack>
          )}

          {flagged.length > 0 && (
            <VStack alignItems="stretch" gap="12px">
              <Box>
                <TitleMedium color="content.primary">
                  {t("flagged-section-title", { count: flagged.length })}
                </TitleMedium>
                <BodySmall color="content.secondary" mt="4px">
                  {t("flagged-section-description")}
                </BodySmall>
              </Box>
              {flagged.map((action) => (
                <FlaggedActionCard key={action.actionId} action={action} t={t} />
              ))}
            </VStack>
          )}
        </>
      )}
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="regulations">
      <RegulationsContent lng={lng} />
    </MeedWizardPage>
  );
}
