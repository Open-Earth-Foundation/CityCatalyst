"use client";
import React from "react";
import { Box, HStack, Icon, Link, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge, BodySmall } from "@/components/package/Texts/Body";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedBreadcrumb } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedBreadcrumb";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { CityFixture, DemoTrack } from "../_lib/types";
import { demoHome, trackHref } from "../_lib/hrefs";
import { useDemoT } from "../_lib/useDemoT";
import { CitySwitcher } from "./CitySwitcher";
import { DemoStepper, type WizardStep } from "./DemoStepper";
import { ScreenTag } from "./ScreenTag";

export interface DemoShellProps {
  lng: string;
  city: CityFixture;
  track: DemoTrack;
  segment: string;
  screenId: string;
  title: string;
  description?: string;
  /** Wizard screens get the stepper and the footer. */
  step?: WizardStep;
  stepsDone?: Partial<Record<WizardStep, boolean>>;
  /** Footer's forward action, when there is one. */
  forward?: { href: string; label: string; disabled?: boolean; hint?: string };
  /** Output areas show a way back instead of a footer. */
  backLabel?: string;
  headerFacts?: string;
  children: React.ReactNode;
}

/**
 * The chrome every screen inside the module shares, after the model of
 * `MeedShell`: a slim context header (breadcrumb, city, city switcher), the
 * stepper on wizard screens, a centred content column, and either a footer
 * with one forward move or a back link for read-only areas.
 */
export function DemoShell({
  lng,
  city,
  track,
  segment,
  screenId,
  title,
  description,
  step,
  stepsDone = {},
  forward,
  backLabel,
  headerFacts,
  children,
}: DemoShellProps) {
  const { t } = useDemoT(lng);
  const home = trackHref(lng, city.slug, track);
  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
    >
      <Box
        w="full"
        bg="base.light"
        borderBottomWidth="1px"
        borderColor="border.overlay"
      >
        <Box mx="auto" w="full" maxW="1090px" px="l" py="m">
          <HStack justifyContent="space-between" alignItems="center" gap="m">
            <VStack alignItems="flex-start" gap="xs" minW="0">
              <MeedBreadcrumb
                crumbs={[
                  { label: t("breadcrumb-demo"), href: demoHome(lng) },
                  {
                    label: `${t("breadcrumb-module")} · ${t(`tab-${track}`)}`,
                    href: home,
                  },
                  { label: title },
                ]}
              />
              <HStack gap="s" alignItems="baseline" minW="0" flexWrap="wrap">
                <TitleMedium color="content.primary" truncate>
                  {city.name}, {city.state}
                </TitleMedium>
                {headerFacts && (
                  <BodySmall color="content.tertiary" whiteSpace="nowrap">
                    {headerFacts}
                  </BodySmall>
                )}
              </HStack>
            </VStack>
            <HStack gap="s" flexShrink={0}>
              <ScreenTag id={screenId} title={t("screen-tag-title")} />
              <CitySwitcher
                lng={lng}
                city={city.slug}
                track={track}
                segment={segment}
              />
            </HStack>
          </HStack>
        </Box>
      </Box>

      {step && (
        <DemoStepper
          lng={lng}
          city={city.slug}
          track={track}
          active={step}
          done={stepsDone}
        />
      )}

      <Box
        display="flex"
        mx="auto"
        pt="xxl"
        pb="xxl-6"
        px="l"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="l"
      >
        {backLabel && (
          <Link
            asChild
            alignSelf="flex-start"
            color="content.link"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
            _focusVisible={FOCUS_RING}
          >
            <NextLink href={home}>
              <HStack gap="xs">
                <Icon as={LuArrowLeft} boxSize="14px" />
                <span>{backLabel}</span>
              </HStack>
            </NextLink>
          </Link>
        )}
        <VStack alignItems="stretch" gap="s">
          <HeadlineSmall color="content.primary">{title}</HeadlineSmall>
          {description && (
            <BodyLarge color="content.secondary">{description}</BodyLarge>
          )}
        </VStack>

        {children}

        {step && (
          <HStack
            justifyContent="space-between"
            alignItems="center"
            gap="m"
            pt="l"
            borderTopWidth="1px"
            borderColor="border.overlay"
            flexWrap="wrap"
          >
            <MeedButton
              asChild
              variant="outlined"
              minW="auto"
              px="l"
              leftIcon={<Icon as={LuArrowLeft} boxSize="16px" />}
            >
              <NextLink
                href={
                  step === "preferences"
                    ? home
                    : trackHref(lng, city.slug, track, "preferences")
                }
              >
                {step === "preferences"
                  ? t("back-to-home")
                  : t("step-preferences")}
              </NextLink>
            </MeedButton>
            {forward && (
              <VStack alignItems="flex-end" gap="xs">
                <MeedButton
                  asChild={!forward.disabled}
                  minW="auto"
                  px="l"
                  disabled={forward.disabled}
                  rightIcon={<Icon as={LuArrowRight} boxSize="16px" />}
                >
                  {forward.disabled ? (
                    <span>{forward.label}</span>
                  ) : (
                    <NextLink href={forward.href}>{forward.label}</NextLink>
                  )}
                </MeedButton>
                {forward.hint && (
                  <BodySmall color="content.tertiary" textAlign="end">
                    {forward.hint}
                  </BodySmall>
                )}
              </VStack>
            )}
          </HStack>
        )}
      </Box>
    </Box>
  );
}
