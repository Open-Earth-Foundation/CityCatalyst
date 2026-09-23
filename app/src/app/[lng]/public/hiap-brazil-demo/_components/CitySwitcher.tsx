"use client";
import { Box, HStack, Icon } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { LuCheck, LuChevronDown, LuMapPin } from "react-icons/lu";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { CITIES } from "../_lib/cities";
import { trackHref } from "../_lib/hrefs";
import type { DemoTrack } from "../_lib/types";
import { useDemoT } from "../_lib/useDemoT";

/**
 * Switches between the five demo cities, keeping the reviewer on the same
 * screen — the same shape as the module's inventory-year menu, since it does
 * the same job in the same place.
 */
export function CitySwitcher({
  lng,
  city,
  track,
  segment,
}: {
  lng: string;
  city: string;
  track: DemoTrack;
  segment?: string;
}) {
  const { t } = useDemoT(lng);
  const router = useRouter();
  const current = CITIES.find((c) => c.slug === city);
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <Box
          as="button"
          aria-label={t("city-switch-aria")}
          display="flex"
          alignItems="center"
          gap="s"
          px="m"
          py="s"
          borderWidth="1px"
          borderColor="border.neutral"
          borderRadius="pill"
          bg="base.light"
          color="content.secondary"
          cursor="pointer"
          _hover={{ borderColor: "content.link", color: "content.link" }}
          _focusVisible={FOCUS_RING}
        >
          <Icon as={LuMapPin} boxSize="14px" />
          <Box
            as="span"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="medium"
            whiteSpace="nowrap"
          >
            {current ? `${current.name} · ${current.state}` : "—"}
          </Box>
          <Icon as={LuChevronDown} boxSize="14px" />
        </Box>
      </MenuTrigger>
      <MenuContent minW="240px" zIndex={2000}>
        {CITIES.map((c) => {
          const isCurrent = c.slug === city;
          return (
            <MenuItem
              key={c.slug}
              value={c.slug}
              onClick={() =>
                !isCurrent &&
                router.push(trackHref(lng, c.slug, track, segment))
              }
            >
              <HStack justifyContent="space-between" w="full">
                <Box as="span">
                  {c.name} · {c.state}
                </Box>
                {isCurrent && (
                  <Icon
                    as={LuCheck}
                    boxSize="14px"
                    color="interactive.tertiary"
                  />
                )}
              </HStack>
            </MenuItem>
          );
        })}
      </MenuContent>
    </MenuRoot>
  );
}
