"use client";

import { LinkIcon, QuestionMarkIcon } from "@/components/icons";
import {
  AccordionItem,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItemContent,
  Box,
  Icon,
  Link,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";

interface NotationsDefinitionAccordionProps {
  t: TFunction;
}

const NotationsDefinitionAccordion: FC<NotationsDefinitionAccordionProps> = ({
  t,
}) => {
  const notations = [
    {
      code: t("ne"),
      description: t("ne-description"),
    },
    {
      code: t("no"),
      description: t("no-description"),
    },
    {
      code: t("ie"),
      description: t("ie-description"),
    },
    {
      code: t("c"),
      description: t("c-description"),
    },
    {
      code: t("na"),
      description: t("na-description"),
    },
  ];
  return (
    <AccordionRoot collapsible defaultValue={["b"]} px="24px">
      <AccordionItem value="a">
        <AccordionItemTrigger>
          <Text
            color="content.secondary"
            fontFamily="heading"
            fontWeight="bold"
            lineHeight="28px"
            fontSize="title.lg"
            textAlign="left"
            display="flex"
            flex="1"
          >
            {t("notation-key-question")}
          </Text>
          <Accordion.ItemIndicator />
        </AccordionItemTrigger>
        <AccordionItemContent>
          <Accordion.ItemBody>
            <Box mb="48px">
              <Box display="flex" gap="16px" py="16px" alignItems="center">
                <Icon as={QuestionMarkIcon} />
                <Text
                  color="content.link"
                  fontFamily="heading"
                  fontSize="title.md"
                  fontWeight="bold"
                >
                  {t("body-question")}
                </Text>
              </Box>
              <Text
                color="content.tertiary"
                fontFamily="body"
                fontSize="body.lg"
                lineHeight="24px"
              >
                {t("notation-key-answer")}
              </Text>
            </Box>
            <Box
              display="grid"
              gridTemplateColumns="1fr 1fr"
              gap="48px"
              textAlign="justify"
              mb="48px"
            >
              <Box>
                <Box display="flex" gap="16px" py="16px" alignItems="center">
                  <Icon as={QuestionMarkIcon} />
                  <Text
                    color="content.link"
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="bold"
                  >
                    {t("common-notation-keys")}
                  </Text>
                </Box>
                <Box color="content.tertiary">
                  {notations.map((notation) => (
                    <Box
                      key={notation.code}
                      display="flex"
                      gap="8px"
                      py="8px"
                      alignItems="baseline"
                    >
                      {"•"}
                      <Text fontWeight="bold" textWrap="nowrap" w="auto">
                        {notation.code}
                      </Text>
                      {"-"}
                      <Text>{notation.description}</Text>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box>
                <Box display="flex" gap="16px" py="16px" alignItems="center">
                  <Icon as={QuestionMarkIcon} />
                  <Text
                    color="content.link"
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="bold"
                  >
                    {t("how-to-use-notation-keys")}
                  </Text>
                </Box>
                <Text
                  color="content.tertiary"
                  fontFamily="body"
                  fontSize="body.lg"
                  lineHeight="24px"
                >
                  {t("how-to-use-notation-keys-description")}
                </Text>
              </Box>
            </Box>
            <Box w="full" display="flex" justifyContent="flex-end">
              <Link
                href="https://unfccc.int/resource/tet/bg/bg2-02_Overview_Notation_Keys.pdf"
                target="_blank"
              >
                <Button variant="ghost" color="content.link" gap="8px">
                  {t("learn-more-link")}
                  <LinkIcon />
                </Button>
              </Link>
            </Box>
          </Accordion.ItemBody>
        </AccordionItemContent>
      </AccordionItem>
    </AccordionRoot>
  );
};

export default NotationsDefinitionAccordion;
