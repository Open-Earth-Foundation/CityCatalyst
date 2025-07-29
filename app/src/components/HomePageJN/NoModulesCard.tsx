import { TFunction } from "i18next";
import {  Link, VStack, Text, Card, Icon } from "@chakra-ui/react";
import { MdArrowForward } from "react-icons/md";
import { TitleMedium } from "@/components/Texts/Title";
import {BodyMedium} from "@/components/Texts/Body";
import {ButtonMedium} from "@/components/Texts/Button";

export const NoModulesCard = ({
  t,
}: {
  t: TFunction;
}) => {
  const emails =
    process.env.NEXT_PUBLIC_SUPPORT_EMAILS ||
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
          >
            <ButtonMedium>{t("contact-us")}</ButtonMedium>
            <Icon as={MdArrowForward} boxSize={4} />
          </Link>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};
