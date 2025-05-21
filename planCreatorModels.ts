/**
 * UN/LOCODE identifier and optional population size of a city.
 */
export interface CityContextData {
    /** UN/LOCODE identifier */
    locode: string;
    /** Population size of the city (≥ 0) */
    populationSize?: number;
  }
  
  /**
   * Emissions data for a city across different sectors.
   */
  export interface CityEmissionsData {
    /** Stationary energy emissions (≥ 0) */
    stationaryEnergyEmissions?: number;
    /** Transportation emissions (≥ 0) */
    transportationEmissions?: number;
    /** Waste emissions (≥ 0) */
    wasteEmissions?: number;
    /** Industrial processes and product use emissions (≥ 0) */
    ippuEmissions?: number;
    /** Agriculture, forestry, and other land use emissions (≥ 0) */
    afoluEmissions?: number;
  }
  
  /**
   * Combined context and emissions data for a city.
   */
  export interface CityData {
    cityContextData: CityContextData;
    cityEmissionsData: CityEmissionsData;
  }
  
  /**
   * Request payload to initiate plan creation for a specific action in a given city,
   * optionally in a specified language.
   */
  export interface PlanRequest {
    cityData: CityData;
    /** Action ID */
    actionId: string;
    /** ISO language code (2 letters, default "en") */
    language?: string;
  }
  
  /**
   * Response returned when a plan creation task is started.
   */
  export interface StartPlanCreationResponse {
    /** Identifier for the asynchronous task */
    taskId: string;
    /** Current status of the task (e.g., "pending") */
    status: string;
  }
  
  /**
   * Response for polling the status of a plan creation task.
   */
  export interface CheckProgressResponse {
    /** Current status of the task (e.g., "in_progress", "completed", "failed") */
    status: string;
    /** Error message if the task failed, otherwise undefined */
    error?: string;
  }