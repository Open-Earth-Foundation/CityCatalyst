import { Tabs } from "@chakra-ui/react";

const TabContent = (props: Tabs.ContentProps) => (
    <Tabs.Content
        p={6}
        rounded={2}
        w="full"
        display="flex"
        flexDirection="column"
        gap="36px"
        borderRadius="8px"
        {...props}
    />
);

export default TabContent; 