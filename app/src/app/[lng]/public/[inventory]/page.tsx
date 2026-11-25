import { io } from "next/cache";
import HomePage from "@/components/GHGIHomePage/HomePage";
import { checkInventoryRedirect } from "./actions";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function PublicHome(props: {
  params: Promise<{ lng: string; inventory: string }>;
}) {
  const { lng, inventory } = await props.params;

  // checkInventoryRedirect hits Sequelize/pg, which reads Date.now()
  // internally - Next.js treats that as unstable during prerendering,
  // so exclude it from the shell.
  await io();
  // Check if we should redirect to city dashboard (server action handles the logic)
  await checkInventoryRedirect(inventory, lng);

  // If no redirect happened, show the original inventory page
  return <HomePage lng={lng} isPublic={true} inventoryId={inventory} />;
}
