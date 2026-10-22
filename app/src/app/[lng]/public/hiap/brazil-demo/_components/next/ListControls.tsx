"use client";
import React, { useCallback, useMemo, useSyncExternalStore } from "react";
import { Box, chakra, HStack, Icon, Menu, VStack } from "@chakra-ui/react";
import { LuCheck, LuChevronDown, LuDownload, LuX } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import {
  MenuContent,
  MenuRadioItem,
  MenuRadioItemGroup,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { TextLink } from "./TextLink";
import {
  facetOptionCount,
  selectionFromSearch,
  selectionIsEmpty,
  type Facet,
  type FacetSelection,
} from "./facets";

/**
 * The controls every proposal list shares, so the home list and the
 * sub-pages filter, sort and export the same way: a facet dropdown with
 * counts, a removable chip per active filter, a link-style choice menu
 * (sort, scenario), and the export button.
 */

/** One facet: a dropdown of checkboxes, each with the count it would leave. */
export function FacetMenu({
  label,
  options,
  counts,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  counts: number[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const active = selected.length > 0;
  return (
    <MenuRoot closeOnSelect={false} positioning={{ placement: "bottom-start" }}>
      <MenuTrigger asChild>
        <chakra.button
          type="button"
          display="inline-flex"
          alignItems="center"
          gap="xs"
          px="m"
          py="s"
          borderRadius="pill"
          borderWidth="1px"
          borderColor={active ? "content.link" : "border.neutral"}
          bg={active ? "background.neutral" : "base.light"}
          color={active ? "content.link" : "content.secondary"}
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="medium"
          _hover={{ borderColor: "content.link" }}
          _focusVisible={FOCUS_RING}
        >
          <span>
            {label}
            {active ? ` · ${selected.length}` : ""}
          </span>
          <Icon as={LuChevronDown} boxSize="14px" />
        </chakra.button>
      </MenuTrigger>
      <MenuContent maxH="360px" overflowY="auto" minW="240px">
        {options.map((o, i) => {
          const checked = selected.includes(o.value);
          return (
            <Menu.CheckboxItem
              key={o.value}
              value={o.value}
              checked={checked}
              disabled={counts[i] === 0 && !checked}
              onCheckedChange={(on) =>
                onChange(
                  on
                    ? [...selected, o.value]
                    : selected.filter((v) => v !== o.value),
                )
              }
            >
              <HStack justifyContent="space-between" w="full" gap="l">
                <HStack gap="s">
                  <Box
                    aria-hidden
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    boxSize="16px"
                    flexShrink={0}
                    borderRadius="2px"
                    borderWidth="1px"
                    borderColor={checked ? "content.link" : "border.neutral"}
                    bg={checked ? "content.link" : "transparent"}
                    color="base.light"
                  >
                    {checked && <Icon as={LuCheck} boxSize="12px" />}
                  </Box>
                  <span>{o.label}</span>
                </HStack>
                <BodySmall as="span" color="content.tertiary">
                  {counts[i]}
                </BodySmall>
              </HStack>
            </Menu.CheckboxItem>
          );
        })}
      </MenuContent>
    </MenuRoot>
  );
}

/** A one-click filter that toggles on and off, with the count it would leave. */
export function ShortcutChip({
  label,
  count,
  pressed,
  onToggle,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <chakra.button
      type="button"
      display="inline-flex"
      alignItems="center"
      gap="xs"
      px="m"
      py="s"
      borderRadius="pill"
      borderWidth="1px"
      borderColor={pressed ? "content.link" : "border.neutral"}
      bg={pressed ? "content.link" : "base.light"}
      color={pressed ? "base.light" : "content.primary"}
      fontFamily="heading"
      fontSize="label.md"
      fontWeight="medium"
      aria-pressed={pressed}
      disabled={count === 0 && !pressed}
      onClick={onToggle}
      _hover={{ borderColor: "content.link" }}
      _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
      _focusVisible={FOCUS_RING}
    >
      {pressed && <Icon as={LuCheck} boxSize="14px" />}
      <span>{label}</span>
      <chakra.span color={pressed ? "base.light" : "content.tertiary"}>
        {count}
      </chakra.span>
    </chakra.button>
  );
}

/** An active filter, removable with one click. */
export function FilterChip({
  label,
  ariaLabel,
  onRemove,
}: {
  label: string;
  ariaLabel: string;
  onRemove: () => void;
}) {
  return (
    <chakra.button
      type="button"
      display="inline-flex"
      alignItems="center"
      gap="xs"
      px="m"
      py="xs"
      borderRadius="pill"
      bg="background.neutral"
      color="content.primary"
      fontFamily="heading"
      fontSize="label.md"
      aria-label={ariaLabel}
      onClick={onRemove}
      _hover={{ bg: "border.overlay" }}
      _focusVisible={FOCUS_RING}
    >
      <span>{label}</span>
      <Icon as={LuX} boxSize="14px" />
    </chakra.button>
  );
}

/** A link-style single choice ("Sort by: …", "Scenario: …"). */
export function ChoiceMenu<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (next: V) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <MenuRoot
      positioning={{ placement: "bottom-end" }}
      onSelect={(d) => onChange(d.value as V)}
    >
      <MenuTrigger asChild>
        <chakra.button
          type="button"
          display="inline-flex"
          alignItems="center"
          gap="xs"
          color="content.link"
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          _focusVisible={FOCUS_RING}
        >
          <span>
            {label}: {current}
          </span>
          <Icon as={LuChevronDown} boxSize="14px" />
        </chakra.button>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioItemGroup value={value}>
          {options.map((o) => (
            <MenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </MenuRadioItem>
          ))}
        </MenuRadioItemGroup>
      </MenuContent>
    </MenuRoot>
  );
}

export function ExportCsvButton({
  onClick,
  t,
}: {
  onClick: () => void;
  t: TFunction;
}) {
  return (
    <MeedButton
      variant="outlined"
      minW="auto"
      px="m"
      leftIcon={<Icon as={LuDownload} boxSize="16px" />}
      onClick={onClick}
      _focusVisible={FOCUS_RING}
    >
      {t("next-export-csv")}
    </MeedButton>
  );
}

/**
 * Facet dropdowns with counts, then the active filters as chips and
 * "Clear filters". The same frame as the home list's filter bar, for any
 * list of items.
 */
export function FacetFilters<T>({
  items,
  facets,
  selected,
  onChange,
  title,
  t,
}: {
  items: T[];
  facets: Facet<T>[];
  selected: FacetSelection;
  onChange: (next: FacetSelection) => void;
  /** Optional eyebrow before the dropdowns. */
  title?: string;
  t: TFunction;
}) {
  const active = facets.flatMap((f) =>
    (selected[f.key] ?? []).map((v) => {
      const option = f.options.find((o) => o.value === v) ?? {
        value: v,
        label: v,
      };
      return {
        facet: f,
        value: v,
        label: f.chip ? f.chip(option) : `${f.title}: ${option.label}`,
        optionLabel: option.label,
      };
    }),
  );
  return (
    <VStack alignItems="stretch" gap="m">
      <HStack gap="s" flexWrap="wrap" alignItems="center">
        {title && (
          <Box w={{ base: "full", md: "150px" }} flexShrink={0}>
            <Overline color="content.tertiary">{title}</Overline>
          </Box>
        )}
        {facets.map((f) => (
          <FacetMenu
            key={f.key}
            label={f.title}
            options={f.options}
            counts={f.options.map((o) =>
              facetOptionCount(items, facets, selected, f, o.value),
            )}
            selected={selected[f.key] ?? []}
            onChange={(next) => onChange({ ...selected, [f.key]: next })}
          />
        ))}
      </HStack>
      {!selectionIsEmpty(selected) && (
        <HStack gap="s" flexWrap="wrap" alignItems="center">
          {active.map((a) => (
            <FilterChip
              key={`${a.facet.key}-${a.value}`}
              label={a.label}
              ariaLabel={t("next-filter-remove", {
                facet: a.facet.title,
                value: a.optionLabel,
              })}
              onRemove={() =>
                onChange({
                  ...selected,
                  [a.facet.key]: (selected[a.facet.key] ?? []).filter(
                    (v) => v !== a.value,
                  ),
                })
              }
            />
          ))}
          <TextLink
            arrow={false}
            muted
            onClick={() =>
              onChange(
                Object.fromEntries(facets.map((f) => [f.key, [] as string[]])),
              )
            }
          >
            {t("next-filters-clear")}
          </TextLink>
        </HStack>
      )}
    </VStack>
  );
}

// The query string as an external store: the server renders without
// filters, the client re-renders with the URL's, and React reconciles the
// two without a hydration mismatch.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}
const searchSnapshot = () => window.location.search;
const serverSnapshot = () => "";
const hashSnapshot = () => window.location.hash.slice(1);

/**
 * Updates some query parameters in place (null removes one), keeping the
 * others and the hash, and tells every URL-backed hook.
 */
export function writeSearchParams(update: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(update)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
  );
  listeners.forEach((l) => l());
}

/** One query parameter, null on the server and when absent. */
export function useSearchParam(key: string): string | null {
  const search = useSyncExternalStore(
    subscribe,
    searchSnapshot,
    serverSnapshot,
  );
  return useMemo(() => new URLSearchParams(search).get(key), [search, key]);
}

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/**
 * The URL's hash without "#": a deep link to a row (`legal/#c40_0048`), so
 * the page can open the row it points at. Empty on the server.
 */
export function useLocationHash(): string {
  return useSyncExternalStore(subscribeHash, hashSnapshot, serverSnapshot);
}

/** A facet selection kept in the URL, so a filtered view can be shared. */
export function useUrlSelection(
  keys: string[],
): [FacetSelection, (next: FacetSelection) => void] {
  const search = useSyncExternalStore(
    subscribe,
    searchSnapshot,
    serverSnapshot,
  );
  const keyList = keys.join(",");
  const selection = useMemo(
    () => selectionFromSearch(search, keyList.split(",")),
    [search, keyList],
  );
  const setSelection = useCallback(
    (next: FacetSelection) =>
      writeSearchParams(
        Object.fromEntries(
          keyList
            .split(",")
            .map((k) => [k, next[k]?.length ? next[k].join(",") : null]),
        ),
      ),
    [keyList],
  );
  return [selection, setSelection];
}
