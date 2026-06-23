import React, { useEffect } from "react";
import type { TFunction } from "i18next";
import { SourceDrawer } from "@/components/GHGI/data-step/SourceDrawer";
import { api } from "@/services/api";

interface ByScopeViewProps {
  sourceId: string;
  sector?: { sectorName: string };
  isOpen: boolean;
  onClose: () => void;
  totalEmissionsData?: string;
  t: TFunction;
  inventoryId: string;
  numberFormat?: string;
}

const ByScopeViewSourceDrawer: React.FC<ByScopeViewProps> = ({
  sourceId,
  sector,
  isOpen,
  onClose,
  t,
  totalEmissionsData,
  inventoryId,
  numberFormat,
}) => {
  const {
    data: source,
    isLoading: isDataSourceLoading,
    error: dataSourceError,
  } = api.useGetDataSourceQuery(
    { datasourceId: sourceId, inventoryId },
    { skip: !isOpen },
  );

  useEffect(() => {
    if (dataSourceError) {
      console.error("Failed to fetch data source:", {
        error: dataSourceError,
        sourceId,
        inventoryId,
      });
    }
  }, [dataSourceError, sourceId, inventoryId]);

  return (
    <SourceDrawer
      source={source?.source}
      sourceData={source?.data}
      sector={{ sectorName: sector?.sectorName ?? "" }}
      isOpen={isOpen}
      loading={isDataSourceLoading}
      onClose={onClose}
      t={t}
      inventoryId={inventoryId}
      hideActions={true}
      numberFormat={numberFormat}
    />
  );
};

export default ByScopeViewSourceDrawer;
