"use client";
import { use } from "react";

import { Box, Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { SimpleGrid } from "@chakra-ui/react";

import { useTranslation } from "@/i18n/client";
import { HeadlineLarge, HeadlineSmall } from "@/components/Texts/Headline";
import type { TFunction } from "i18next";
import { MdLocationCity, MdPersonOutline } from "react-icons/md";
import { BodyMedium } from "@/components/Texts/Body";

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
      spaceX={4}
      spaceY={4}
      p={4}
      h="full"
      w="full"
      bg="background.backgroundLight"
    >
      <HeadlineLarge>{t("organization")}</HeadlineLarge>
      <SimpleGrid minChildWidth="xs" gap="40px" w="full">
        {Array(5)
          .keys()
          .map((i) => (
            <ProjectCard t={t} key={i} />
          ))}
      </SimpleGrid>
    </VStack>
  );
}
