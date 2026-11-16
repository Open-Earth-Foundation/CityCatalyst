import type { Block } from "@/backend/ingestion-benchmark/report";

export type CliOptions = {
  cases?: string;
  set?: Block;
  eligible: boolean;
  /** Every case in the manifest, in groups of at most 10, with one report. */
  all: boolean;
  runs: number;
  list: boolean;
  dryRun: boolean;
  updateBaseline: boolean;
  noMlflow: boolean;
  configPath: string;
  /** Results file of an earlier run to rescore with the current scorer and keys. */
  rescore?: string;
};

export const DEFAULT_CONFIG_PATH = "benchmarks/pdf/config.local.json";
export const REQUIRED_RUNS = 3;
const BLOCKS: Block[] = ["validated", "held-out", "dev"];

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    eligible: false,
    all: false,
    runs: REQUIRED_RUNS,
    list: false,
    dryRun: false,
    updateBaseline: false,
    noMlflow: false,
    configPath: DEFAULT_CONFIG_PATH,
  };
  const valueOf = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} needs a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "--cases":
        options.cases = valueOf(flag, i++);
        break;
      case "--set": {
        const value = valueOf(flag, i++);
        if (!BLOCKS.includes(value as Block)) {
          throw new Error(`--set must be one of ${BLOCKS.join(", ")}`);
        }
        options.set = value as Block;
        break;
      }
      case "--runs": {
        const runs = Number(valueOf(flag, i++));
        if (!Number.isInteger(runs) || runs < 1) {
          throw new Error("--runs must be a positive integer");
        }
        options.runs = runs;
        break;
      }
      case "--config":
        options.configPath = valueOf(flag, i++);
        break;
      case "--rescore":
        options.rescore = valueOf(flag, i++);
        break;
      case "--eligible":
        options.eligible = true;
        break;
      case "--all":
        options.all = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--update-baseline":
        options.updateBaseline = true;
        break;
      case "--no-mlflow":
        options.noMlflow = true;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (options.updateBaseline && options.runs !== REQUIRED_RUNS) {
    throw new Error("exploratory runs cannot update the baseline");
  }
  if (options.updateBaseline && options.rescore) {
    throw new Error("a rescore cannot update the baseline");
  }
  return options;
}
