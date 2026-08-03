"use client";
import { MeedWizardPage } from "../../MeedWizardPage";

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  return <MeedWizardPage params={props.params} stepKey="finance" />;
}
