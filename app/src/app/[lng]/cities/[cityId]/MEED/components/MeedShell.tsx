"use client";
import React from "react";
import { Box, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { formatEmissions } from "@/util/helpers";
import { MeedButton } from "./MeedButton";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MEED_WIZARD_STEPS, getMeedPath } from "../steps";
import { useMeedSectionStates } from "../meedStatus";
import { setMeedStepState } from "../meedLocalState";
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
  const { t: tDashboard } = useTranslation(lng, "dashboard");
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

  /**
   * Moving forward confirms the step you are leaving.
   *
   * The prototype called `confirmStep()` from every screen's own footer button;
   * the port centralised the footer here but never carried the confirmation
   * across, so `confirmed` was only ever written by preferences and pre-flight.
   * That left `statusOf` unable to return "complete" for the other five steps —
   * no green checks in the stepper, and a readiness roll-up permanently stuck
   * at "0 complete" however much real data had loaded.
   *
   * Confirming here means "the user saw this step and chose to move on", which
   * is exactly the needs-review → complete transition. It is idempotent, and
   * `setMeedStepState` never lets `confirmed` go back to false.
   */
  /**
   * Steps the flow must not move past until they are done.
   *
   * The footer used to advance unconditionally, so a user could walk the whole
   * wizard having entered nothing and only discover at pre-flight that the
   * ranking could not run. These are the same two inputs the readiness gate
   * scores — the ones the city actually supplies.
   */
  const REQUIRED_TO_ADVANCE = ["emissions", "preferences"];
  const currentStatus = step ? states[step.key]?.status : undefined;
  const isStepIncomplete =
    !!step &&
    REQUIRED_TO_ADVANCE.includes(step.key) &&
    currentStatus !== "complete" &&
    currentStatus !== "needs-review";

  const goForward = (href: string) => {
    if (step) setMeedStepState(inventoryId, step.key, { confirmed: true });
    router.push(href);
  };

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
        crumbs={[
          {
            label: tDashboard("breadcrumb-tools"),
            href: `/${lng}/cities/${cityId}`,
          },
          {
            label: tDashboard("breadcrumb-meed"),
            href: getMeedPath(lng, cityId, inventoryId),
          },
          { label: crumb },
        ]}
        t={t}
      />

      {/*
        The stepper is wizard chrome. Results and the read-only output areas are
        not steps, and rendering a 3-step progress bar with nothing active there
        implied they sat somewhere in a flow they had already left.
      */}
      {step && (
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
      )}

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
             *
             * The arrows are load-bearing: the labels are step names, so
             * "Financial feasibility" alone gives no clue which direction it
             * goes or that it is navigation at all.
             */}
            <MeedButton
              variant="outlined"
              minW="auto"
              px="l"
              leftIcon={<Icon as={LuArrowLeft} boxSize="16px" />}
              onClick={() => router.push(previousHref)}
            >
              {previousLabel}
            </MeedButton>

            {forwardAction && (
              <VStack alignItems="flex-end" gap="xs">
                <MeedButton
                  minW="auto"
                  px="l"
                  rightIcon={<Icon as={LuArrowRight} boxSize="16px" />}
                  disabled={isStepIncomplete}
                  aria-describedby={
                    isStepIncomplete ? "meed-step-block" : undefined
                  }
                  onClick={() => goForward(forwardAction.href)}
                >
                  {forwardAction.label}
                </MeedButton>
                {/* The gate explains itself beside the control it disables. */}
                {isStepIncomplete && (
                  <Caption id="meed-step-block" color="content.tertiary">
                    {t("step-blocked")}
                  </Caption>
                )}
              </VStack>
            )}
          </HStack>
        )}
      </Box>
    </Box>
  );
}
