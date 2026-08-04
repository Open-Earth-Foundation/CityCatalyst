"use client";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { useGetMeedActionsQuery } from "@/services/api";
import type {
  MeedPrioritizeCityResult,
  MeedRankedActionResult,
} from "@/util/types/meed";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedShell } from "../../components/MeedShell";
import { EmptyState } from "./components/EmptyState";
import { RankingTable } from "./components/RankingTable";
import { DetailPanel, type ScoreWeights } from "./components/DetailPanel";
import { buildActionIndex } from "./components/actionCatalog";

/**
 * Default final-score weights from the prototype scoring pipeline.
 * TODO(meed backend): read the actual weights from the prioritization
 * response metadata once the ranking is wired in.
 */
const SCORE_WEIGHTS: ScoreWeights = {
  impact: 0.55,
  alignment: 0.22,
  feasibility: 0.23,
};

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  const { t } = useTranslation(lng, "meed-results");
  const router = useRouter();

  // TODO(meed backend): replace with the stored prioritization result for
  // this inventory once the hiap-meed service layer lands (contract types in
  // @/util/types/meed). Until then no ranking exists and the empty state
  // renders.
  const [ranking] = useState<MeedPrioritizeCityResult | null>(null);
  const [selected, setSelected] = useState<MeedRankedActionResult | null>(null);

  const { data: catalog } = useGetMeedActionsQuery({ cityId });
  const index = useMemo(() => buildActionIndex(catalog), [catalog]);

  const ranked = ranking?.ranked_actions ?? [];

  return (
    <MeedShell
      lng={lng}
      cityId={cityId}
      inventoryId={inventoryId}
      title={t("page-title")}
      description={t("page-description")}
      currentLabel={t("page-title")}
    >
      <>
        {ranked.length === 0 ? (
          <EmptyState
            title={t("empty-title")}
            body={t("empty-body")}
            actionLabel={t("empty-action")}
            onAction={() =>
              router.push(
                `/${lng}/cities/${cityId}/MEED/${inventoryId}/preflight`,
              )
            }
          />
        ) : (
          <>
            <LabelLarge color="content.tertiary">
              {t("summary-line", { count: ranked.length })}
            </LabelLarge>
            <RankingTable
              actions={ranked}
              index={index}
              t={t}
              onSelect={setSelected}
            />
          </>
        )}

        {selected && (
          <DetailPanel
            action={selected}
            index={index}
            weights={SCORE_WEIGHTS}
            t={t}
            onClose={() => setSelected(null)}
          />
        )}
      </>
    </MeedShell>
  );
}
