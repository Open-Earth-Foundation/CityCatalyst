"use client";
import React from "react";
import { setMeedStepState } from "./meedLocalState";
import { MeedShell } from "./components/MeedShell";

/**
 * Adapter kept so step pages can stay `<MeedWizardPage params stepKey>`.
 * All the chrome — context header, breadcrumb, stepper, footer navigation —
 * now lives in MeedShell.
 */
export function MeedWizardPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
  stepKey: string;
  children?: React.ReactNode;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);

  // Opening a step marks it visited, so the overview and the stepper reflect it.
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
      stepKey={props.stepKey}
    >
      {props.children}
    </MeedShell>
  );
}
