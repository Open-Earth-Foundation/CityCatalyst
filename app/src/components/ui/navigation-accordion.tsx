import { Accordion, Box, Icon, Link, Span, Text } from "@chakra-ui/react";
import * as React from "react";
import { BiChevronDown } from "react-icons/bi";
import { GoArrowRight } from "react-icons/go";

interface NavigationItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface NavigationAccordionProps {
  title: string;
  icon: React.ComponentType<any>;
  items: NavigationItem[];
  t: Function;
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
    <Box w="full" display="flex" flexDirection="column" py="24px">
      <Accordion.Root collapsible defaultValue={defaultOpen ? ["section"] : []}>
        <Accordion.Item value="section">
          <Accordion.ItemTrigger
            w="full"
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            border="none"
            pl="16px"
          >
            <Box display="flex" alignItems="center" gap="12px">
              <Icon as={IconComponent} color={"content.tertiary"} boxSize={6} />
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
              <Icon as={BiChevronDown} color={"content.tertiary"} boxSize={6} />
            </Accordion.ItemIndicator>
          </Accordion.ItemTrigger>
          <Accordion.ItemContent>
            <Accordion.ItemBody border="none" pl="16px">
              {items.map((item, index) => (
                <Link
                  key={index}
                  rounded={0}
                  w="full"
                  h="48px"
                  gap="12px"
                  display="flex"
                  justifyContent="space-between"
                  href={item.href}
                  onClick={item.onClick}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Text fontSize="body.lg" color="content.primary">
                    {t(item.label)}
                  </Text>
                  <Icon
                    as={GoArrowRight}
                    color={"interactive.control"}
                    boxSize={6}
                  />
                </Link>
              ))}
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        </Accordion.Item>
      </Accordion.Root>
    </Box>
  );
};
