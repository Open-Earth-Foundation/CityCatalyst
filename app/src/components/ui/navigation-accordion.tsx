import { Accordion, Box, Icon, Link, Span, Text } from "@chakra-ui/react";
import * as React from "react";
import { BiChevronDown } from "react-icons/bi";

interface NavigationItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface NavigationAccordionProps {
  title: string;
  icon: React.ElementType;
  items: NavigationItem[];
  t: (key: string) => string;
  defaultOpen?: boolean;
}

export const NavigationAccordion: React.FC<NavigationAccordionProps> = ({
  title,
  icon: IconComponent,
  items,
  t,
  defaultOpen = false,
}) => {
  return (
    <Box w="full" display="flex" flexDirection="column">
      <Accordion.Root collapsible defaultValue={defaultOpen ? ["section"] : []}>
        <Accordion.Item value="section" borderBottom="none">
          <Accordion.ItemTrigger
            w="full"
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            border="none"
          >
            <Box display="flex" alignItems="center" gap="12px">
              <Icon as={IconComponent} color={"interactive.secondary"} boxSize={6} />
              <Span
                flex="1"
                fontSize="body.lg"
                color="content.tertiary"
                fontWeight="normal"
              >
                {title}
              </Span>
            </Box>
            <Accordion.ItemIndicator>
              <Icon as={BiChevronDown} color={"icon.default"} boxSize={6} />
            </Accordion.ItemIndicator>
          </Accordion.ItemTrigger>
          <Accordion.ItemContent>
            <Accordion.ItemBody border="none" pl="xl">
              {items.map((item, index) => {
                const isExternal =
                  !!item.href &&
                  (item.href.startsWith("http://") ||
                    item.href.startsWith("https://"));
                return (
                  <Link
                    key={index}
                    rounded={0}
                    w="full"
                    h="48px"
                    gap="12px"
                    display="flex"
                    alignItems="center"
                    href={item.href}
                    onClick={item.onClick}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    target={isExternal ? "_blank" : undefined}
                  >
                    <Text fontSize="body.lg" color="content.primary">
                      {t(item.label)}
                    </Text>
                  </Link>
                );
              })}
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        </Accordion.Item>
      </Accordion.Root>
    </Box>
  );
};
