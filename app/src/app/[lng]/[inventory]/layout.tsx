"use client";

import InventoryLayout from "@/components/shared/InventoryLayout";

export default function DataLayout(props: { children: React.ReactNode }) {
  const { children } = props;

  return <InventoryLayout>{children}</InventoryLayout>;
}
