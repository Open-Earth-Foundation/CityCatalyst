"use client";
import React, { useSyncExternalStore } from "react";
import {
  Box,
  chakra,
  HStack,
  Icon,
  IconButton,
  VStack,
} from "@chakra-ui/react";
import { LuChevronUp, LuLightbulb, LuX } from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { useDemoT } from "../_lib/useDemoT";

const KEY = "hiap-br-demo:notice-collapsed";
const EVENT = "hiap-br-demo:notice-changed";

function readCollapsed(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeCollapsed(value: boolean) {
  try {
    window.sessionStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Storage blocked: the notice simply stays as it is.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * The corner notice that carries a screen's open decisions — what C40, I Care
 * or the working group still has to settle. Keeping them out of the screen
 * itself lets the layout read the way the product would, while every screen
 * still tells the reviewer that it is a concept and what may move it.
 * Dismissing collapses it to a pill for the rest of the session.
 */
export function ConceptNotice({
  lng,
  points,
}: {
  lng: string;
  points: string[];
}) {
  const { t } = useDemoT(lng);
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => true);
  if (points.length === 0) return null;

  return (
    <Box
      position="fixed"
      left={{ base: "16px", md: "24px" }}
      bottom={{ base: "16px", md: "24px" }}
      zIndex={1200}
      maxW={{ base: "calc(100vw - 32px)", md: "400px" }}
      css={{ "@media print": { display: "none" } }}
    >
      {collapsed ? (
        <chakra.button
          type="button"
          onClick={() => writeCollapsed(false)}
          display="flex"
          alignItems="center"
          gap="s"
          px="m"
          py="s"
          bg="content.link"
          color="base.light"
          borderRadius="pill"
          boxShadow="2dp"
          _hover={{ opacity: 0.92 }}
          _focusVisible={FOCUS_RING}
          aria-label={t("notice-expand-aria")}
        >
          <Icon as={LuLightbulb} boxSize="16px" />
          <LabelMedium color="base.light">
            {t("notice-pill", { count: points.length })}
          </LabelMedium>
          <Icon as={LuChevronUp} boxSize="14px" />
        </chakra.button>
      ) : (
        <Box
          role="note"
          aria-label={t("notice-title")}
          bg="base.light"
          borderWidth="1px"
          borderColor="content.link"
          borderRadius="rounded"
          boxShadow="2dp"
          p="l"
        >
          <VStack alignItems="stretch" gap="m">
            <HStack
              justifyContent="space-between"
              alignItems="flex-start"
              gap="s"
            >
              <HStack gap="s" alignItems="center">
                <Icon as={LuLightbulb} boxSize="18px" color="content.link" />
                <LabelLarge color="content.primary">
                  {t("notice-title")}
                </LabelLarge>
              </HStack>
              <IconButton
                size="xs"
                variant="ghost"
                aria-label={t("notice-dismiss")}
                onClick={() => writeCollapsed(true)}
                color="content.secondary"
                _focusVisible={FOCUS_RING}
              >
                <LuX />
              </IconButton>
            </HStack>
            <BodyMedium color="content.secondary">
              {t("notice-body")}
            </BodyMedium>
            <VStack
              as="ul"
              alignItems="stretch"
              gap="s"
              pl="m"
              m="0"
              css={{ listStyleType: "disc" }}
            >
              {points.map((point, i) => (
                <Box as="li" key={i}>
                  <BodySmall color="content.secondary">{point}</BodySmall>
                </Box>
              ))}
            </VStack>
          </VStack>
        </Box>
      )}
    </Box>
  );
}
