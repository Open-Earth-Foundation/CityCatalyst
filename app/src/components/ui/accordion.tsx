import { Accordion, HStack, Icon } from "@chakra-ui/react";
import * as React from "react";
import { LuChevronDown } from "react-icons/lu";

interface AccordionItemTriggerProps extends Accordion.ItemTriggerProps {
  indicatorPlacement?: "start" | "center" | "end";
}

export const AccordionItemTrigger = React.forwardRef<
  HTMLButtonElement,
  AccordionItemTriggerProps
>(function AccordionItemTrigger(props, ref) {
  const { children, indicatorPlacement = "center", ...rest } = props;
  return (
    <Accordion.ItemTrigger {...rest} ref={ref} pr="16px">
      {indicatorPlacement === "start" && (
        <Accordion.ItemIndicator rotate={{ base: "-90deg", _open: "0deg" }}>
          <LuChevronDown />
        </Accordion.ItemIndicator>
      )}
      <HStack
        gap="4"
        flex="1"
        width="full"
        textAlign={indicatorPlacement === "center" ? "center" : "start"}
        justify={indicatorPlacement === "center" ? "center" : "flex-start"}
      >
        {children}
        {indicatorPlacement === "center" && (
          <Accordion.ItemIndicator>
            <Icon as={LuChevronDown} size="2xl" />
          </Accordion.ItemIndicator>
        )}
      </HStack>
      {indicatorPlacement === "end" && (
        <Accordion.ItemIndicator>
          <Icon as={LuChevronDown} size="2xl" />
        </Accordion.ItemIndicator>
      )}
    </Accordion.ItemTrigger>
  );
});

interface AccordionItemContentProps extends Accordion.ItemContentProps {}

export const AccordionItemContent = React.forwardRef<
  HTMLDivElement,
  AccordionItemContentProps
>(function AccordionItemContent(props, ref) {
  return (
    <Accordion.ItemContent>
      <Accordion.ItemBody {...props} ref={ref} />
    </Accordion.ItemContent>
  );
});

export const AccordionRoot = Accordion.Root;
export const AccordionItem = Accordion.Item;
