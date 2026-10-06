"use client";
import { useState } from "react";
import { Box, HStack, Icon, IconButton, Table } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedMeter } from "../../../components/MeedMeter";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import type { MeedActionIndex } from "../../results/components/actionCatalog";
import { docScope } from "../policyAggregates";
import { FOCUS_RING } from "../../../focusRing";
import {
  evidenceStrengthNum,
  scoreTone,
  SCOPE_LABEL_KEYS,
  SCOPE_TONE,
  SIGNAL_TYPE_KEYS,
  STRENGTH_LABEL_KEYS,
  STRENGTH_TONE,
  TONE_TEXT_COLOR,
  type ActionPolicyRow,
  type PolicyEvidence,
} from "../policyRows";

/** Five aligned columns — the evidence rows used to be a flex-wrap soup. */
const EVIDENCE_GRID = "minmax(200px, 2fr) 108px 132px 108px 64px";

function ScopeCell({ value, t }: { value: number | null; t: TFunction }) {
  return (
    <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
      <BodyMedium
        color={value !== null ? "content.primary" : "content.tertiary"}
      >
        {value !== null
          ? t("percent-value", { value: Math.round(value * 100) })
          : "—"}
      </BodyMedium>
    </Table.Cell>
  );
}

function EvidenceGridRow({ ev, t }: { ev: PolicyEvidence; t: TFunction }) {
  const scope = docScope(ev.document_type);
  const strength = (ev.signal_strength ?? "").toLowerCase();
  const strengthKey = STRENGTH_LABEL_KEYS[strength];
  const pct = Math.round(evidenceStrengthNum(ev) * 100);
  const signalKey = SIGNAL_TYPE_KEYS[ev.signal_type ?? ""] ?? "signal-other";

  return (
    <>
      <BodySmall color="content.secondary">
        {ev.document_name ?? t("unnamed-document")}
      </BodySmall>
      <Box>
        <MeedStatusTag tone={SCOPE_TONE[scope]}>
          {t(SCOPE_LABEL_KEYS[scope])}
        </MeedStatusTag>
      </Box>
      <Caption>{t(signalKey)}</Caption>
      <Box>
        {strengthKey && (
          <MeedStatusTag tone={STRENGTH_TONE[strength] ?? "neutral"}>
            {t(strengthKey)}
          </MeedStatusTag>
        )}
      </Box>
      <LabelMedium
        color="content.secondary"
        textAlign="end"
        fontVariantNumeric="tabular-nums"
      >
        {t("percent-value", { value: pct })}
      </LabelMedium>
    </>
  );
}

export interface PolicyActionRowProps {
  row: ActionPolicyRow;
  index: MeedActionIndex;
  t: TFunction;
}

/** One action, with its supporting policy evidence behind a disclosure. */
export function PolicyActionRow({ row, index, t }: PolicyActionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = row.evidence.length > 0;
  const pct = Math.round(row.score * 100);
  const tone = scoreTone(row.score);
  const name = index.get(row.id)?.actionName ?? row.id;
  const detailId = `policy-evidence-${row.id}`;

  return (
    <>
      <Table.Row>
        <Table.Cell verticalAlign="top">
          <HStack gap="s" alignItems="flex-start">
            {hasEvidence ? (
              <IconButton
                aria-label={t(expanded ? "collapse-action" : "expand-action", {
                  action: name,
                })}
                aria-expanded={expanded}
                aria-controls={detailId}
                size="2xs"
                variant="ghost"
                flexShrink={0}
                onClick={() => setExpanded((v) => !v)}
                _focusVisible={FOCUS_RING}
              >
                <Icon as={expanded ? LuChevronDown : LuChevronRight} />
              </IconButton>
            ) : (
              <Box w="24px" flexShrink={0} />
            )}
            <BodyMedium color="content.primary" wordBreak="break-word">
              {name}
            </BodyMedium>
          </HStack>
        </Table.Cell>
        <ScopeCell value={row.scopeMax.National} t={t} />
        <ScopeCell value={row.scopeMax.Regional} t={t} />
        <ScopeCell value={row.scopeMax.Municipal} t={t} />
        <Table.Cell textAlign="end">
          <HStack gap="s" justifyContent="flex-end">
            <Box w="48px" flexShrink={0}>
              <MeedMeter
                value={row.score}
                tone={tone}
                ariaLabel={`${name} — ${t("percent-value", { value: pct })}`}
              />
            </Box>
            <LabelMedium
              color={TONE_TEXT_COLOR[tone]}
              minW="40px"
              textAlign="end"
              fontVariantNumeric="tabular-nums"
            >
              {t("percent-value", { value: pct })}
            </LabelMedium>
          </HStack>
        </Table.Cell>
      </Table.Row>

      {expanded && (
        <Table.Row bg="background.neutral">
          <Table.Cell colSpan={5} id={detailId} px="m" py="m">
            <Box overflowX="auto">
              <Box
                display="grid"
                gridTemplateColumns={EVIDENCE_GRID}
                gap="8px 16px"
                alignItems="center"
                minW="640px"
              >
                <Overline>{t("evidence-column-plan")}</Overline>
                <Overline>{t("evidence-column-scope")}</Overline>
                <Overline>{t("evidence-column-signal")}</Overline>
                <Overline>{t("evidence-column-strength")}</Overline>
                <Overline textAlign="end">
                  {t("evidence-column-weight")}
                </Overline>
                {row.evidence.map((ev, i) => (
                  <EvidenceGridRow key={`${row.id}-ev-${i}`} ev={ev} t={t} />
                ))}
              </Box>
            </Box>
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}
