import { usePathname, useParams } from "next/navigation";
import { useMemo } from "react";

const LAST_VISITED_CITY_KEY = "lastVisitedCityId";
const LAST_VISITED_INVENTORY_KEY = "lastVisitedInventoryId";

/**
 * Custom hook to extract city and inventory IDs from the current route
 * This is more reliable than useParams() alone as it also parses the pathname
 * to ensure it updates when the route changes. Also persists last visited
 * city/inventory in sessionStorage for use on routes that don't have these params.
 */
export function useRouteParams() {
  const pathname = usePathname();
  const params = useParams();

  return useMemo(() => {
    // Extract from params first (primary source)
    let cityId: string | null = null;
    let inventoryId: string | null = null;

    const cityParam = params.city;
    if (cityParam) {
      cityId = Array.isArray(cityParam) ? cityParam[0] : cityParam;
    }

    const inventoryParam = params.inventory;
    if (inventoryParam && inventoryParam !== "null") {
      inventoryId = Array.isArray(inventoryParam)
        ? inventoryParam[0]
        : inventoryParam;
    }

    // Fallback: parse from pathname if not in params
    // This handles cases where params might not be updated yet and ensures reactivity
    if (!cityId && pathname) {
      const cityMatch = pathname.match(/\/cities\/([^\/]+)/);
      if (cityMatch && cityMatch[1]) {
        cityId = cityMatch[1];
      }
    }

    if (!inventoryId && pathname) {
      // Try to find inventory in various path patterns:
      // - /cities/[cityId]/GHGI/[inventoryId]
      // - /cities/[cityId]/HIAP/[inventoryId]
      // - /[lng]/[inventoryId] (direct inventory route)
      const inventoryMatch =
        pathname.match(/\/GHGI\/([^\/]+)/) ||
        pathname.match(/\/HIAP\/([^\/]+)/) ||
        pathname.match(/^\/[a-z]{2}\/([a-f0-9-]{36})(?:\/|$)/);
      if (inventoryMatch && inventoryMatch[1] && inventoryMatch[1] !== "null") {
        inventoryId = inventoryMatch[1];
      }
    }

    // Persist city/inventory to sessionStorage when we have them from the route
    // This allows us to use the last visited city/inventory on routes that don't have them
    if (typeof window !== "undefined") {
      if (cityId) {
        sessionStorage.setItem(LAST_VISITED_CITY_KEY, cityId);
      }
      if (inventoryId) {
        sessionStorage.setItem(LAST_VISITED_INVENTORY_KEY, inventoryId);
      }
    }

    // Get last visited city/inventory from sessionStorage as fallback
    // This is useful for routes like /organization/[id]/account-settings that don't have city in URL
    let lastVisitedCityId: string | null = null;
    let lastVisitedInventoryId: string | null = null;
    
    if (typeof window !== "undefined") {
      try {
        lastVisitedCityId = sessionStorage.getItem(LAST_VISITED_CITY_KEY);
        lastVisitedInventoryId = sessionStorage.getItem(LAST_VISITED_INVENTORY_KEY);
      } catch (e) {
        // SessionStorage might not be available in some contexts
      }
    }

    return {
      cityId: cityId || lastVisitedCityId || null,
      inventoryId: inventoryId || lastVisitedInventoryId || null,
      pathname, // Include pathname so components can react to it
    };
  }, [pathname, params.city, params.inventory]);
}
