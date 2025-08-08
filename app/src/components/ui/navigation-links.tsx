import { Box, Icon, Link, Text, VStack } from "@chakra-ui/react";
import * as React from "react";
import { BiHomeAlt, BiSolidBarChartAlt2 } from "react-icons/bi";
import { LuLayoutGrid } from "react-icons/lu";

interface NavigationItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<any>;
}

interface NavigationLinksProps {
  items: NavigationItem[];
  t: Function;
}

export const NavigationLinks: React.FC<NavigationLinksProps> = ({
  items,
  t,
}) => {
  return (
    <Box w="full" display="flex" flexDirection="column" px={4} py="24px">
      <VStack w="full" justifyContent="space-between">
        {items.map((item, index) => (
          <Link
            key={index}
            rounded={0}
            w="full"
            h="48px"
            gap="12px"
            href={item.href}
            onClick={item.onClick}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon as={item.icon} color={"content.tertiary"} boxSize={6} />
            <Text fontSize="body.lg" color="content.secondary">
              {t(item.label)}
            </Text>
          </Link>
        ))}
      </VStack>
    </Box>
  );
};
