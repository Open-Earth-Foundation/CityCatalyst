import { env } from "next-runtime-env";

export function getFeatureFlags(): string[] {
  const flags = env("NEXT_PUBLIC_FEATURE_FLAGS");
  let flagsList: string[] = [];

  if (flags) {
    flagsList = flags.split(",");
  }

  return flagsList;
}

export function hasFeatureFlag(flag: string): boolean {
  return getFeatureFlags().includes(flag);
}
