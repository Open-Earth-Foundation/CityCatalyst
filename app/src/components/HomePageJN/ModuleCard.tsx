import { Card, Button, HStack, Image } from "@chakra-ui/react";
import React from "react";
import type { TFunction } from "i18next";
import { ButtonMedium } from "@/components/Texts/Button";
import { BodyMedium, BodySmall } from "../Texts/Body";
import { HeadlineSmall } from "../Texts/Headline";

export function ModuleCard({
  name,
  author,
  description,
  url,
  t,
  lng,
  enabled = true,
}: {
  name: string;
  author: string;
  description: string;
  url: string;
  t: TFunction;
  lng: string;
  enabled?: boolean;
}) {
  return (
    <Card.Root
      width="320px"
      opacity={enabled ? 1 : 0.5}
      pointerEvents={enabled ? "auto" : "none"}
      borderColor="gray.200"
      borderWidth="1px"
      borderRadius="xl"
      bg="white"
      boxShadow="sm"
      transition="box-shadow 0.2s"
      _hover={{ boxShadow: enabled ? "md" : "sm" }}
    >
      <Card.Body gap={2}>
        <HStack align="start" gap={4} mb={2}>
          <Image src="/assets/icon_inverted.svg" boxSize={8} />
          <Card.Title mt={2} fontSize="2xl" fontWeight="bold" color="black">
            <HeadlineSmall>{name}</HeadlineSmall>
          </Card.Title>
        </HStack>
        <BodySmall>{t("by", { author: author })}</BodySmall>
        {/* <Card.Description>
          <BodyMedium lineClamp={2}>
            {description}
          </BodyMedium>
        </Card.Description> */}
      </Card.Body>
      <Card.Footer justifyContent="flex-end">
        {/* {url && (
          <Link
            href={'#'}
            color="content.link"
            fontWeight="medium"
            mb={4}
            display="block"
            target="_blank"
            rel="noopener noreferrer"
          >
            <BodyMedium textDecoration="underline" color="content.link">
              {t("learn-more")}
            </BodyMedium>
          </Link>
        )} */}
        <Button
          onClick={() => {
            window.location.href = `/${lng}${url}`;
          }}
          variant="outline"
          w="fit-content"
          borderRadius="rounded-xxl"
          borderColor="border.neutral"
          mt={2}
          alignItems="center"
        >
          <ButtonMedium>{t("open")}</ButtonMedium>
          <Image
            src="/assets/open_in_new.svg"
            color="interactive.control"
            boxSize={6}
          />
        </Button>
      </Card.Footer>
    </Card.Root>
  );
}
