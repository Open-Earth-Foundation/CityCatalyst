"use client";
import { use } from "react";

import { Button, Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { SimpleGrid } from "@chakra-ui/react";

import { useTranslation } from "@/i18n/client";
import { HeadlineLarge, HeadlineSmall } from "@/components/Texts/Headline";
import { LabelLarge } from "@/components/Texts/Label";
import type { TFunction } from "i18next";
import {
  MdArrowForward,
  MdLocationCity,
  MdPersonOutline,
} from "react-icons/md";
import { BodyLarge, BodyMedium } from "@/components/Texts/Body";
import NextLink from "next/link";

function ProjectCard(props: { t: TFunction }) {
  const cityCount = 50;
  const userCount = 8;

  return (
    <Card.Root shadow="2dp" borderRadius="8px">
      <Card.Header>
        <HeadlineSmall>Project Name</HeadlineSmall>
      </Card.Header>
      <Card.Body>
        Phase I of the BPJP work done for C40 and GCoM, under the Resilient
        Cities program.
      </Card.Body>
      <Card.Footer>
        <HStack>
          <Icon
            as={MdLocationCity}
            boxSize="24px"
            color="interactive.control"
          />
          <BodyMedium>{cityCount}</BodyMedium>
          <Icon
            as={MdPersonOutline}
            boxSize="24px"
            color="interactive.control"
          />
          <BodyMedium>{userCount}</BodyMedium>
        </HStack>
      </Card.Footer>
    </Card.Root>
  );
}

export default function OrganizationPage(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "organization");

  return (
    <VStack
      spaceY="56px"
      p="56px"
      h="full"
      w="full"
      bg="background.backgroundLight"
      alignItems="start"
      justifyContent="start"
    >
      <VStack spaceY="24px" alignItems="start" justifyContent="start">
        <HeadlineLarge>{t("all-projects")}</HeadlineLarge>
        <BodyLarge>{t("explore-projects-description")}</BodyLarge>
      </VStack>
      <SimpleGrid minChildWidth="xs" gap="24px" w="full">
        {
          // use Array.from to fix iterator warning
          Array.from(Array(5).keys()).map((i) => (
            <ProjectCard t={t} key={i} />
          ))
        }
      </SimpleGrid>
      <NextLink
        href="https://citycatalyst.openearth.org"
        target="_blank"
        rel="noopener noreferrer"
        style={{ width: "100%" }}
      >
        <Card.Root w="full">
          <Card.Header>
            <LabelLarge>{t("learning")}</LabelLarge>
            <HeadlineSmall>{t("learn-more-blog")}</HeadlineSmall>
          </Card.Header>
          <Card.Body>{t("read-blog-description")}</Card.Body>
          <Card.Footer justifyContent="right">
            <Button variant="outline" colorScheme="primary">
              {t("visit-blog")} <Icon as={MdArrowForward} />
            </Button>
          </Card.Footer>
        </Card.Root>
      </NextLink>
    </VStack>
  );
}
