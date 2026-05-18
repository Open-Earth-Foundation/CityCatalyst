import { TFunction } from "i18next";
import {
  Accordion,
  Box,
  Drawer,
  Icon,
  Link,
  Portal,
  Span,
  Text,
} from "@chakra-ui/react";
import { BiChevronDown } from "react-icons/bi";
import { CloseButton } from "@/components/ui/close-button";

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

/** Mock third-party data sources tree for the onboarding sources drawer. */
const getSourceCategories = (t: TFunction): SourceCategory[] => [
  {
    value: "stationary_energy",
    title: t("sources-category-stationary-energy"),
    subcategories: [
      {
        value: "residential_buildings",
        title: t("sources-subcategory-residential-buildings"),
        links: [
          {
            label: t("sources-link-oil-gas-plant"),
            href: "#",
          },
          {
            label: t("sources-link-lng-terminal"),
            href: "#",
          },
          {
            label: t("sources-link-power-plant"),
            href: "#",
          },
        ],
      },
      {
        value: "commercial_buildings",
        title: t("sources-subcategory-commercial-buildings"),
        links: [],
      },
      {
        value: "manufacturing",
        title: t("sources-subcategory-manufacturing"),
        links: [],
      },
      {
        value: "energy_industries",
        title: t("sources-subcategory-energy-industries"),
        links: [],
      },
      {
        value: "agriculture_forestry_fishing",
        title: t("sources-subcategory-agriculture-forestry-fishing"),
        links: [],
      },
      {
        value: "non_specified",
        title: t("sources-subcategory-non-specified"),
        links: [],
      },
      {
        value: "fugitive_coal",
        title: t("sources-subcategory-fugitive-coal"),
        links: [],
      },
      {
        value: "fugitive_oil_gas",
        title: t("sources-subcategory-fugitive-oil-gas"),
        links: [],
      },
    ],
  },
  {
    value: "transportation",
    title: t("sources-category-transportation"),
    subcategories: [],
  },
  {
    value: "waste_wastewater",
    title: t("sources-category-waste-wastewater"),
    subcategories: [],
  },
  {
    value: "ippu",
    title: t("sources-category-ippu"),
    subcategories: [],
  },
  {
    value: "afolu",
    title: t("sources-category-afolu"),
    subcategories: [],
  },
];

function SourceLinksList({ links }: { links: SourceLink[] }) {
  if (links.length === 0) return null;

  return (
    <Box as="ol" listStyleType="decimal" pl="24px" spaceY="8px">
      {links.map((link) => (
        <Box as="li" key={link.label} fontSize="body.md">
          <Link
            href={link.href}
            color="content.link"
            textDecoration="underline"
            onClick={(e) => e.preventDefault()}
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
  return (
    <Accordion.Root
      collapsible
      multiple
      defaultValue={["residential_buildings"]}
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

export default function ThirdPartySourcesDrawer({ t }: { t: TFunction }) {
  const categories = getSourceCategories(t);

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
              <Accordion.Root
                collapsible
                multiple
                defaultValue={["stationary_energy"]}
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
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
