import { TFunction } from "i18next";
import { useMemo } from "react";
import {
  Accordion,
  Box,
  Drawer,
  Icon,
  Link,
  Portal,
  Span,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { BiChevronDown } from "react-icons/bi";
import { CloseButton } from "@/components/ui/close-button";
import { api } from "@/services/api";
import type { DataSourcePreviewItem } from "@/util/types";

interface SourceLink {
  label: string;
  href: string;
}

interface SourceSubcategory {
  value: string;
  title: string;
  links: SourceLink[];
}

interface SourceCategory {
  value: string;
  title: string;
  subcategories: SourceSubcategory[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function groupPreviewSources(
  items: DataSourcePreviewItem[],
): SourceCategory[] {
  const sectorMap = new Map<string, Map<string, SourceLink[]>>();

  for (const item of items) {
    const sectorName = item.sectorName || "Other";
    const subTitle =
      item.subCategoryName ||
      item.subSectorName ||
      item.gpcReferenceNumber;

    if (!sectorMap.has(sectorName)) {
      sectorMap.set(sectorName, new Map());
    }
    const subMap = sectorMap.get(sectorName)!;
    if (!subMap.has(subTitle)) {
      subMap.set(subTitle, []);
    }
    subMap.get(subTitle)!.push({
      label: item.datasourceName,
      href: item.url?.trim() || "#",
    });
  }

  return Array.from(sectorMap.entries()).map(([sectorName, subMap]) => ({
    value: slugify(sectorName),
    title: sectorName,
    subcategories: Array.from(subMap.entries()).map(([title, links]) => ({
      value: slugify(`${sectorName}-${title}`),
      title,
      links,
    })),
  }));
}

function SourceLinksList({ links }: { links: SourceLink[] }) {
  if (links.length === 0) return null;

  return (
    <Box as="ol" listStyleType="decimal" pl="24px" spaceY="8px">
      {links.map((link) => (
        <Box as="li" key={`${link.label}-${link.href}`} fontSize="body.md">
          <Link
            href={link.href}
            color="content.link"
            textDecoration="underline"
            target={link.href.startsWith("http") ? "_blank" : undefined}
            rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
            onClick={(e) => {
              if (link.href === "#") {
                e.preventDefault();
              }
            }}
          >
            {link.label}
          </Link>
        </Box>
      ))}
    </Box>
  );
}

function SubcategoryAccordion({
  subcategories,
}: {
  subcategories: SourceSubcategory[];
}) {
  const defaultSubcategory = subcategories[0]?.value;

  return (
    <Accordion.Root
      collapsible
      multiple
      defaultValue={defaultSubcategory ? [defaultSubcategory] : []}
      borderTopWidth="0"
    >
      {subcategories.map((subcategory) => (
        <Accordion.Item key={subcategory.value} value={subcategory.value}>
          <Accordion.ItemTrigger h="52px" px="8px">
            <Span
              flex="1"
              fontSize="body.lg"
              fontFamily="body"
              fontStyle="normal"
              fontWeight="medium"
              lineHeight="24px"
              textAlign="left"
            >
              {subcategory.title}
            </Span>
            <Accordion.ItemIndicator>
              <Icon as={BiChevronDown} color="content.secondary" boxSize={8} />
            </Accordion.ItemIndicator>
          </Accordion.ItemTrigger>
          <Accordion.ItemContent px="8px">
            <Accordion.ItemBody pb="16px">
              <SourceLinksList links={subcategory.links} />
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

interface ThirdPartySourcesDrawerProps {
  t: TFunction;
  cityId: string;
  year: number;
  inventoryType?: string;
}

export default function ThirdPartySourcesDrawer({
  t,
  cityId,
  year,
  inventoryType,
}: ThirdPartySourcesDrawerProps) {
  const canFetch =
    Boolean(cityId) && year > 0 && Boolean(inventoryType);

  const { data, isLoading, isError } = api.useGetDataSourcePreviewQuery(
    { cityId, year, inventoryType },
    { skip: !canFetch },
  );

  const categories = useMemo(
    () => groupPreviewSources(data?.sources ?? []),
    [data?.sources],
  );

  const defaultCategory = categories[0]?.value;

  return (
    <Drawer.Root size="sm">
      <Drawer.Trigger asChild>
        <Link
          fontSize="body.md"
          color="content.link"
          fontFamily="body"
          textDecoration="underline"
          href="#"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {t("third-party-inventory-data-check-sources")}
        </Link>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap="16px"
            >
              <Drawer.Title
                fontFamily="heading"
                fontSize="title.lg"
                fontStyle="normal"
                fontWeight="semibold"
              >
                {t("sources-drawer-title")}
              </Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body spaceY="24px">
              <Text
                fontSize="body.md"
                fontStyle="normal"
                fontWeight="400"
                letterSpacing="wide"
                color="content.tertiary"
              >
                {t("sources-drawer-description")}
              </Text>
              {!canFetch && (
                <Text fontSize="body.md" color="content.tertiary">
                  {t("sources-drawer-incomplete-setup")}
                </Text>
              )}
              {canFetch && isLoading && (
                <Box display="flex" justifyContent="center" py="24px">
                  <Spinner size="lg" />
                </Box>
              )}
              {canFetch && isError && (
                <Text fontSize="body.md" color="content.tertiary">
                  {t("sources-drawer-load-error")}
                </Text>
              )}
              {canFetch && !isLoading && !isError && categories.length === 0 && (
                <Text fontSize="body.md" color="content.tertiary">
                  {t("sources-drawer-no-sources")}
                </Text>
              )}
              {canFetch && !isLoading && !isError && categories.length > 0 && (
                <Accordion.Root
                  collapsible
                  multiple
                  defaultValue={defaultCategory ? [defaultCategory] : []}
                >
                  {categories.map((category) => (
                    <Accordion.Item key={category.value} value={category.value}>
                      <Accordion.ItemTrigger h="52px" px="8px">
                        <Span
                          flex="1"
                          fontSize="title.md"
                          fontFamily="heading"
                          fontStyle="normal"
                          fontWeight="medium"
                          lineHeight="24px"
                          textAlign="left"
                        >
                          {category.title}
                        </Span>
                        <Accordion.ItemIndicator>
                          <Icon
                            as={BiChevronDown}
                            color="content.secondary"
                            boxSize={8}
                          />
                        </Accordion.ItemIndicator>
                      </Accordion.ItemTrigger>
                      <Accordion.ItemContent px="8px">
                        <Accordion.ItemBody pb="16px">
                          {category.subcategories.length > 0 ? (
                            <SubcategoryAccordion
                              subcategories={category.subcategories}
                            />
                          ) : (
                            <Text
                              fontSize="body.md"
                              color="content.tertiary"
                              fontStyle="italic"
                            >
                              {t("sources-category-empty-placeholder")}
                            </Text>
                          )}
                        </Accordion.ItemBody>
                      </Accordion.ItemContent>
                    </Accordion.Item>
                  ))}
                </Accordion.Root>
              )}
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
