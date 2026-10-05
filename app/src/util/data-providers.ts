// Well-known sources of activity data and emission factors, suggested in the
// "Provider name" combobox of the add emission data modal. Users can still
// type any provider that is not listed here.
export const KNOWN_DATA_PROVIDERS: string[] = [
  "IPCC",
  "IEA",
  "EDGAR",
  "EPA",
  "Eurostat",
  "UNFCCC",
  "World Bank",
  "National statistics office",
  "National greenhouse gas inventory",
  "Municipal / city government",
  "Regional government",
  "Utility company",
  "Energy ministry",
  "Transport authority",
  "Waste management authority",
  "Academic / research institution",
  "Company or facility records",
];

export const DATA_YEAR_MIN = 1990;

/** Years from the current year down to DATA_YEAR_MIN (and `extraYear`, if outside that range). */
export const getDataYearOptions = (extraYear?: number): number[] => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= DATA_YEAR_MIN; y--) {
    years.push(y);
  }
  if (extraYear && !years.includes(extraYear)) {
    years.push(extraYear);
    years.sort((a, b) => b - a);
  }
  return years;
};
