import HomePage from "@/components/GHGIHomePage/HomePage";
import { checkInventoryRedirect } from "./actions";

export default async function PublicHome(props: {
  params: Promise<{ lng: string; inventory: string }>;
}) {
  const { lng, inventory } = await props.params;

  // Check if we should redirect to city dashboard (server action handles the logic)
  await checkInventoryRedirect(inventory, lng);

  // If no redirect happened, show the original inventory page
  return <HomePage lng={lng} isPublic={true} inventoryId={inventory} />;
}
