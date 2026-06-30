import type { TFunction } from "i18next";

const SOURCE_PREFERENCE_PREFIX = "source:";

export const SOURCE_PREFERENCE_COMMANDS = {
  noSourcePreference: "__source_preference_none__",
  startChooseSources: "__start_choose_sources__",
  setEmptyNotationPreference: "__set_empty_notation__",
} as const;

export type SourcePreferenceCommand =
  | (typeof SOURCE_PREFERENCE_COMMANDS)[keyof typeof SOURCE_PREFERENCE_COMMANDS]
  | `${typeof SOURCE_PREFERENCE_PREFIX}${string}`;

export const NO_SOURCE_PREFERENCE =
  SOURCE_PREFERENCE_COMMANDS.noSourcePreference;
export const START_CHOOSE_SOURCES =
  SOURCE_PREFERENCE_COMMANDS.startChooseSources;
export const SET_EMPTY_NOTATION_PREFERENCE =
  SOURCE_PREFERENCE_COMMANDS.setEmptyNotationPreference;

export function sourcePreferenceCommand(
  sourceName: string,
): SourcePreferenceCommand {
  return `${SOURCE_PREFERENCE_PREFIX}${sourceName}`;
}

function sourceNameFromPreference(preference: string): string | null {
  return preference.startsWith(SOURCE_PREFERENCE_PREFIX)
    ? preference.slice(SOURCE_PREFERENCE_PREFIX.length)
    : null;
}

export function buildSourcePreferenceLabel(
  t: TFunction,
  preference: string,
): string {
  if (preference === NO_SOURCE_PREFERENCE) {
    return t("chat-source-preference-no-preference");
  }
  if (preference === START_CHOOSE_SOURCES) {
    return t("chat-start-choose-sources");
  }
  if (preference === SET_EMPTY_NOTATION_PREFERENCE) {
    return t("chat-quick-reply-set-notation");
  }

  const sourceName = sourceNameFromPreference(preference);
  if (sourceName) {
    return t("chat-source-preference-prefer", {
      sourceName,
    });
  }

  return preference;
}

export function buildSourcePreferenceReply(
  t: TFunction,
  preference: string,
): string {
  if (preference === NO_SOURCE_PREFERENCE) {
    return t("chat-source-preference-reply-no-preference");
  }
  if (preference === START_CHOOSE_SOURCES) {
    return t("chat-start-choose-sources-reply");
  }
  if (preference === SET_EMPTY_NOTATION_PREFERENCE) {
    return t("chat-quick-reply-set-notation-reply");
  }

  const sourceName = sourceNameFromPreference(preference);
  if (sourceName) {
    return t("chat-source-preference-reply-prefer", {
      sourceName,
    });
  }

  return preference;
}
