import { Tabs } from "@chakra-ui/react";

const TabTrigger = (props: Tabs.TriggerProps) => (
    <Tabs.Trigger
        fontFamily="heading"
        justifyContent={"left"}
        letterSpacing={"wide"}
        color="content.secondary"
        lineHeight="20px"
        fontStyle="normal"
        fontSize="label.lg"
        height="52px"
        w={"223px"}
        _selected={{
            color: "content.link",
            fontSize: "label.lg",
            fontWeight: "medium",
            backgroundColor: "background.neutral",
            borderRadius: "8px",
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "content.link",
        }}
        {...props}
    >
        {props.children}
    </Tabs.Trigger>
);

export default TabTrigger; 