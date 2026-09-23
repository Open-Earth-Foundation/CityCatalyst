"use client";
import React, { useMemo } from "react";
import {
  Box,
  Card,
  HStack,
  Text,
  useBreakpointValue,
  useToken,
} from "@chakra-ui/react";
import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { SECTORS } from "@/util/constants";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { BodySmall } from "@/components/package/Texts/Body";
import { actionName, sectorLabel, type MeedActionIndex } from "./actionCatalog";

const ROW_HEIGHT = 28;
const MOBILE_MAX_BARS = 10;
/** Characters of action name on the y-axis, and the margin that fits them. */
const LABEL_CHARS = { md: 34, lg: 52 } as const;
const LABEL_WIDTH = { md: 250, lg: 360 } as const;

interface GlanceDatum extends BarDatum {
  id: string;
  score: number;
  color: string;
  name: string;
  sector: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Hex for a catalog sector tag, matching the `sectors.*` theme tokens. Nivo
 * runs its colour modifiers through d3-color, which cannot parse a CSS
 * variable, so the raw value is used here rather than the token.
 */
function sectorHex(sectorTag: string | null | undefined, fallback: string) {
  if (!sectorTag) return fallback;
  const tag = sectorTag.toLowerCase().replace(/[_\s]+/g, "-");
  const sector = SECTORS.find(
    (s) => s.name === tag || tag.startsWith(s.name) || s.name.startsWith(tag),
  );
  return sector?.color ?? fallback;
}

/**
 * The whole ranking in one picture: a horizontal bar per action, rank 1 at
 * the top, length = final score, colour = sector. It answers "how far apart
 * are these actions really?" faster than a column of numbers can, and clicking
 * a bar opens the same drawer the table does.
 *
 * Nivo bars are not focusable, so the table beneath remains the keyboard path;
 * the caption says so rather than pretending otherwise.
 */
export function RankingGlanceChart({
  actions,
  index,
  t,
  onSelect,
  colorOf,
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  t: TFunction;
  onSelect: (action: MeedRankedActionResult) => void;
  /**
   * Hex colour for a catalog sector tag. Defaults to the GPC sector palette;
   * catalogs on another sector scheme (AdaptaBrasil) supply their own.
   */
  colorOf?: (sectorTag: string | null | undefined) => string | undefined;
}) {
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;
  const labelChars =
    useBreakpointValue({ base: 0, md: LABEL_CHARS.md, lg: LABEL_CHARS.lg }) ??
    LABEL_CHARS.lg;
  const labelWidth =
    useBreakpointValue({ base: 8, md: LABEL_WIDTH.md, lg: LABEL_WIDTH.lg }) ??
    LABEL_WIDTH.lg;
  const [textColor, labelColor, gridColor, fallbackColor] = useToken("colors", [
    "content.secondary",
    "content.primary",
    "border.overlay",
    "content.link",
  ]);

  const shown = isMobile ? actions.slice(0, MOBILE_MAX_BARS) : actions;

  const { data, byId } = useMemo(() => {
    const byId = new Map<string, MeedRankedActionResult>();
    const data: GlanceDatum[] = shown.map((action) => {
      byId.set(action.action_id, action);
      return {
        id: action.action_id,
        score: Number(action.final_score.toFixed(3)),
        color:
          colorOf?.(index.get(action.action_id)?.sectorTag) ??
          sectorHex(index.get(action.action_id)?.sectorTag, fallbackColor),
        name: actionName(index, action.action_id, t),
        sector: sectorLabel(index, action.action_id, t),
      };
    });
    // Nivo draws the first datum at the bottom; rank 1 belongs at the top.
    return { data: data.reverse(), byId };
  }, [shown, index, t, fallbackColor, colorOf]);

  const height = Math.max(240, shown.length * ROW_HEIGHT + 56);

  // One swatch per sector that actually appears, in ranking order of first
  // appearance — the tooltip names the sector too, but a legend reads faster.
  const legend = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of [...data].reverse()) {
      if (!seen.has(d.sector)) seen.set(d.sector, d.color);
    }
    return [...seen.entries()];
  }, [data]);

  return (
    <Box>
      <HStack
        justifyContent="space-between"
        alignItems="center"
        gap="m"
        flexWrap="wrap"
      >
        <LabelLarge color="content.primary">{t("glance-title")}</LabelLarge>
        <HStack gap="m" flexWrap="wrap">
          {legend.map(([sector, color]) => (
            <HStack key={sector} gap="xs" alignItems="center">
              <Box
                boxSize="12px"
                borderRadius="full"
                bg={color}
                flexShrink={0}
              />
              <BodySmall color="content.secondary">{sector}</BodySmall>
            </HStack>
          ))}
        </HStack>
      </HStack>
      {/* What the chart is and how to browse it without a mouse: for
          assistive tech, not for the layout — the bars speak for themselves. */}
      <Caption srOnly>
        {t("glance-description", { count: shown.length })}{" "}
        {t("glance-keyboard-note")}
      </Caption>
      <Box h={`${height}px`} minH="240px" position="relative" mt="s">
        <ResponsiveBar<GlanceDatum>
          data={data}
          keys={["score"]}
          indexBy="id"
          layout="horizontal"
          margin={{
            top: 8,
            right: 56,
            bottom: 32,
            left: labelWidth,
          }}
          padding={0.3}
          borderRadius={4}
          valueScale={{ type: "linear", min: 0, max: 1 }}
          indexScale={{ type: "band", round: true }}
          colors={(bar) => bar.data.color}
          enableGridX
          enableGridY={false}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickValues: [0, 0.25, 0.5, 0.75, 1],
            tickSize: 0,
            tickPadding: 8,
            format: (value) => Number(value).toFixed(2),
          }}
          axisLeft={
            isMobile
              ? null
              : {
                  tickSize: 0,
                  tickPadding: 8,
                  format: (id) =>
                    truncate(
                      byId.get(String(id))
                        ? actionName(index, String(id), t)
                        : String(id),
                      labelChars,
                    ),
                }
          }
          // Values sit just past the end of each bar, in dark text on the
          // card background, rather than inside bars whose sector colour may
          // not carry 12px text.
          enableLabel
          label={(bar) => Number(bar.value).toFixed(2)}
          labelPosition="end"
          labelOffset={8}
          labelSkipWidth={0}
          labelTextColor={labelColor}
          theme={{
            text: { fill: textColor, fontSize: 12 },
            axis: { ticks: { text: { fill: textColor, fontSize: 12 } } },
            grid: { line: { stroke: gridColor, strokeWidth: 1 } },
          }}
          tooltip={({ data: datum }) => (
            // Long action names: keep the type small and the box wide enough
            // that a name wraps to two lines at most.
            <Card.Root
              py="s"
              px="m"
              boxShadow="2dp"
              w="max-content"
              minW="260px"
              maxW="480px"
            >
              <HStack alignItems="flex-start" gap="s">
                <Box
                  boxSize="10px"
                  mt="xs"
                  borderRadius="full"
                  bg={datum.color}
                  flexShrink={0}
                />
                <Box minW={0}>
                  <Text
                    fontSize="body.sm"
                    lineHeight="18px"
                    color="content.primary"
                    whiteSpace="normal"
                  >
                    {datum.name}
                  </Text>
                  <Text fontSize="caption" color="content.tertiary" mt="xs">
                    {t("glance-tooltip-score", {
                      sector: datum.sector,
                      score: datum.score.toFixed(2),
                    })}
                  </Text>
                </Box>
              </HStack>
            </Card.Root>
          )}
          onClick={(bar) => {
            const action = byId.get(String(bar.data.id));
            if (action) onSelect(action);
          }}
          onMouseEnter={(_datum, event) => {
            (event.currentTarget as SVGElement).style.cursor = "pointer";
          }}
          role="application"
          ariaLabel={t("glance-title")}
          barAriaLabel={(bar) =>
            `${bar.data.name}: ${Number(bar.value).toFixed(2)}`
          }
        />
      </Box>
    </Box>
  );
}
