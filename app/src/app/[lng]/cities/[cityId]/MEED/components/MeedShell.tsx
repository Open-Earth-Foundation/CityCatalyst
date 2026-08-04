"use client";
import React from "react";
import { Box, HStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { formatEmissions } from "@/util/helpers";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MEED_WIZARD_STEPS, getMeedPath } from "../steps";
import { useMeedSectionStates } from "../meedStatus";
import { useMeedInventories } from "../useMeedInventories";
import {
  returnHref,
  returnLabelKey,
  stepHref,
  useMeedReturn,
} from "../navigation";
import { MeedStepper } from "./MeedStepper";
import { MeedContextHeader } from "./MeedContextHeader";

export interface MeedShellProps {
  lng: string;
  cityId: string;
  inventoryId: string;
  /** Step key from MEED_WIZARD_STEPS, or undefined for processing/results. */
  stepKey?: string;
  /** Heading + intro shown above the content. */
  title?: string;
  description?: string;
  /** Label for the last breadcrumb crumb when this isn't a wizard step. */
  currentLabel?: string;
  /** Hide the prev/next footer (processing, results). */
  hideFooter?: boolean;
  /** Non-interactive stepper while a ranking is generating. */
  stepperDisabled?: boolean;
  children: React.ReactNode;
}

/**
 * Shared chrome for every screen inside the module except the overview:
 * context header (with breadcrumb and inventory switcher), stepper, a centred
 * content column, and the footer navigation.
 *
 * Navigation is deliberately non-linear. The footer still offers the next step
 * as the obvious path, but the stepper and breadcrumb are always live, and when
 * the user arrived from pre-flight or the results screen the footer returns
 * them there instead of marching on through the wizard.
 */
export function MeedShell({
  lng,
  cityId,
  inventoryId,
  stepKey,
  title,
  description,
  currentLabel,
  hideFooter = false,
  stepperDisabled = false,
  children,
}: MeedShellProps) {
  const { t } = useTranslation(lng, "meed");
  const router = useRouter();
  const ret = useMeedReturn();
  const { states } = useMeedSectionStates(inventoryId);
  const { inventories } = useMeedInventories(cityId);

  const { data: inventory } = api.useGetInventoryQuery(inventoryId, {
    skip: !inventoryId,
  });
  const { data: city } = api.useGetCityQuery(cityId, { skip: !cityId });
  const { data: userInfo } = api.useGetUserInfoQuery();

  const stepIndex = stepKey
    ? MEED_WIZARD_STEPS.findIndex((s) => s.key === stepKey)
    : -1;
  const step = stepIndex >= 0 ? MEED_WIZARD_STEPS[stepIndex] : undefined;
  const nextStep =
    stepIndex >= 0 && stepIndex < MEED_WIZARD_STEPS.length - 1
      ? MEED_WIZARD_STEPS[stepIndex + 1]
      : undefined;

  const emissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions, userInfo?.numberFormat)
    : undefined;

  const backHref = returnHref(lng, cityId, inventoryId, ret);
  const backLabel = t(returnLabelKey(ret));

  // Switching inventory keeps you on the same screen — progress is stored per
  // inventory, so the new one legitimately starts empty.
  const onInventorySelect = (item: YearSelectorItem) => {
    router.push(getMeedPath(lng, cityId, item.inventoryId, step?.segment));
  };

  const heading = title ?? (step ? t(step.labelKey) : "");
  const crumb = currentLabel ?? (step ? t(step.labelKey) : "");

  const previousStep =
    stepIndex > 0 ? MEED_WIZARD_STEPS[stepIndex - 1] : undefined;

  // Left action: the step before this one, or the way out of the flow.
  const previousHref =
    !ret.isExplicit && previousStep
      ? stepHref(lng, cityId, inventoryId, previousStep.segment)
      : backHref;
  const previousLabel =
    !ret.isExplicit && previousStep ? t(previousStep.labelKey) : backLabel;

  // Right action: one forward move. When the user came from pre-flight or the
  // results screen, forward means going back there — not deeper into the wizard.
  // On the last step the page body owns the primary action, so there is none.
  const forwardAction = ret.isExplicit
    ? { href: backHref, label: backLabel }
    : nextStep
      ? {
          href: stepHref(lng, cityId, inventoryId, nextStep.segment),
          label: t(nextStep.labelKey),
        }
      : undefined;

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
    >
      <MeedContextHeader
        cityName={city?.name ?? inventory?.city?.name}
        emissions={emissions}
        inventoryYear={inventory?.year ?? undefined}
        inventories={inventories}
        currentInventoryId={inventoryId}
        onInventorySelect={onInventorySelect}
        backHref={backHref}
        backLabel={backLabel}
        currentLabel={crumb}
        lng={lng}
        t={t}
      />

      <MeedStepper
        activeIndex={stepIndex}
        states={states}
        lng={lng}
        cityId={cityId}
        inventoryId={inventoryId}
        t={t}
        from={ret.isExplicit ? ret.target : undefined}
        disabled={stepperDisabled}
      />

      <Box
        display="flex"
        mx="auto"
        py="xxl"
        px="l"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="l"
      >
        {heading && (
          <Box>
            <HeadlineSmall>{heading}</HeadlineSmall>
            {description && (
              <BodyLarge color="content.secondary" mt="s">
                {description}
              </BodyLarge>
            )}
          </Box>
        )}

        {children}

        {!hideFooter && (
          <HStack
            justifyContent="space-between"
            w="full"
            pt="l"
            mt="s"
            borderTopWidth="1px"
            borderColor="border.overlay"
          >
            {/*
             * Exactly two actions, never the same one twice. Left always steps
             * back; right always moves the flow forward. Everything autosaves,
             * so there is no "save" verb anywhere.
             */}
            <CCTerraButton
              variant="outlined"
              minW="auto"
              px="l"
              onClick={() => router.push(previousHref)}
            >
              {previousLabel}
            </CCTerraButton>

            {forwardAction && (
              <CCTerraButton
                minW="auto"
                px="l"
                onClick={() => router.push(forwardAction.href)}
              >
                {forwardAction.label}
              </CCTerraButton>
            )}
          </HStack>
        )}
      </Box>
    </Box>
  );
}
