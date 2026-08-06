import { TFunction } from "i18next";
import { Link, VStack, Card } from "@chakra-ui/react";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium } from "@/components/package/Texts/Body";
import { env } from "@/lib/runtime-env";

export const NoModulesCard = ({ t }: { t: TFunction }) => {
  const emails =
    env("NEXT_PUBLIC_SUPPORT_EMAILS") ||
    "info@openearth.org,greta@openearth.org";
  return (
    <Card.Root
      width="320px"
      borderColor="border.neutral"
      borderWidth="1px"
      borderRadius="xl"
      bg="white"
      boxShadow="sm"
    >
      <Card.Body p={6}>
        <VStack align="start" gap={3}>
          <TitleMedium fontSize="lg" fontWeight="bold" color="content.tertiary">
            {t("no-modules-available")}
          </TitleMedium>
          <BodyMedium color="content.tertiary">
            {t("no-modules-description")}
          </BodyMedium>
          <Link
            href={`mailto:${emails}`}
            color="content.link"
            fontSize="sm"
            fontWeight="bold"
            textTransform="uppercase"
            display="flex"
            alignItems="center"
            gap={2}
            target="_blank"
            rel="noopener noreferrer"
            _hover={{ textDecoration: "underline" }}
          >
            {t("contact-us")}
          </Link>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};
