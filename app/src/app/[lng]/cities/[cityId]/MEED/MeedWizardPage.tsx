"use client";
import React from "react";
import NextLink from "next/link";
import { HStack, Icon, Link, VStack } from "@chakra-ui/react";
import { LuArrowLeft } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import { setMeedStepState } from "./meedLocalState";
import { MeedShell } from "./components/MeedShell";
import { MEED_OUTPUT_AREAS } from "./steps";
import { returnHref, returnLabelKey, useMeedReturn } from "./navigation";
import { FOCUS_RING } from "./focusRing";

/**
 * Adapter kept so screens can stay `<MeedWizardPage params stepKey>`.
 * All the chrome — context header, breadcrumb, stepper, footer navigation —
 * lives in MeedShell.
 *
 * Two kinds of screen come through here. A **wizard step** gets the stepper and
 * the footer navigation. An **output area** — legal screening, policy
 * alignment, financial feasibility, city context — is read-only and reached
 * from the results screen, so it gets neither: showing a 3-step stepper with
 * nothing active, or a "next step" button, would imply it sits in a flow it no
 * longer belongs to. It still records that it was visited, because the results
 * cards quote the detail line these screens write.
 */
export function MeedWizardPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
  stepKey: string;
  children?: React.ReactNode;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  const { t } = useTranslation(lng, "meed");

  const outputArea = MEED_OUTPUT_AREAS.find((a) => a.key === props.stepKey);
  const ret = useMeedReturn();

  React.useEffect(() => {
    if (inventoryId && props.stepKey) {
      setMeedStepState(inventoryId, props.stepKey, { visited: true });
    }
  }, [inventoryId, props.stepKey]);

  return (
    // Each screen renders its own intro copy, so the shell only supplies the heading.
    <MeedShell
      lng={lng}
      cityId={cityId}
      inventoryId={inventoryId}
      stepKey={outputArea ? undefined : props.stepKey}
      currentLabel={outputArea ? t(outputArea.labelKey) : undefined}
      hideFooter={Boolean(outputArea)}
      {...(outputArea ? { stepperDisabled: true } : {})}
    >
      {outputArea ? (
        <VStack alignItems="stretch" gap="l">
          {/*
            Output areas have no wizard footer, so they would otherwise be dead
            ends. The return target is read from the URL, so "back" leads to
            wherever the user opened this from — normally the results screen.
          */}
          <Link
            asChild
            alignSelf="flex-start"
            color="content.link"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
            _focusVisible={FOCUS_RING}
          >
            <NextLink href={returnHref(lng, cityId, inventoryId, ret)}>
              <HStack gap="xs">
                <Icon as={LuArrowLeft} boxSize="16px" />
                {t(returnLabelKey(ret))}
              </HStack>
            </NextLink>
          </Link>
          {props.children}
        </VStack>
      ) : (
        props.children
      )}
    </MeedShell>
  );
}
