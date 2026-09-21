import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";

/**
 * Server-side reader for the Global API endpoints the MEED+ module consumes.
 *
 * The prototype called these six endpoints directly from the browser (16 call
 * sites — see docs/MeedModuleMigration-Inventory.md §1); routing them through
 * here gives the module one API boundary and keeps filtering consistent with
 * what `hiap-meed` reads server-side.
 *
 * All methods return `null` on upstream errors or missing data — screens
 * render precondition/empty states rather than failing.
 */
export class MeedGlobalApiService {
  private static async fetchJson(
    path: string,
    params?: Record<string, string>,
  ): Promise<unknown | null> {
    try {
      const search = params ? `?${new URLSearchParams(params)}` : "";
      const url = `${GLOBAL_API_URL}${path}${search}`;
      const response = await fetch(url);
      logger.info(`MeedGlobalApiService: ${url} → ${response.status}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      logger.error(`MeedGlobalApiService fetch failed: ${error}`);
      return null;
    }
  }

  /** Live mitigation action catalog (names, descriptions, sectors, i18n fields). */
  public static async fetchActionPathways(): Promise<unknown | null> {
    return this.fetchJson(`/api/v1/action-pathways`);
  }

  /** Socioeconomic indicators for a city. Sparse coverage — often null. */
  public static async fetchCityAttributes(
    locode: string,
  ): Promise<unknown | null> {
    return this.fetchJson(
      `/api/v0/city_attributes/${encodeURIComponent(locode)}`,
    );
  }

  /** Policy-alignment scores per action, with top evidence rows. */
  public static async fetchPolicyScores(
    locode: string,
    topEvidenceLimit = 5,
  ): Promise<unknown | null> {
    return this.fetchJson(
      `/api/v1/cities/${encodeURIComponent(locode)}/action-policy-scores`,
      { top_evidence_limit: String(topEvidenceLimit) },
    );
  }

  /** Climate-finance feasibility rows per action. */
  public static async fetchFinanceFeasibility(
    locode: string,
    countryCode: string,
  ): Promise<unknown | null> {
    return this.fetchJson(
      `/api/v1/cities/${encodeURIComponent(locode)}/climate-finance/feasibility`,
      { country_code: countryCode },
    );
  }

  /**
   * Follow a relative link returned inside a Global API response
   * (`links.projects` / `links.opportunities` on finance feasibility rows).
   * Only Global-API city paths are allowed.
   */
  public static async followLink(relativePath: string): Promise<unknown | null> {
    if (!relativePath.startsWith("/api/v1/cities/")) {
      logger.warn(
        `MeedGlobalApiService.followLink rejected path: ${relativePath}`,
      );
      return null;
    }
    return this.fetchJson(relativePath);
  }
}
