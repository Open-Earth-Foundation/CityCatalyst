"use client";
import { DisplaySmall } from "@/components/Texts/Display";
import { useTranslation } from "@/i18n/client";
import { MdArrowBack } from "react-icons/md";
import { Button, Center, Icon, Box, Link } from "@chakra-ui/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BodyXLarge } from "@/components/Texts/Body";

interface InviteErrorViewProps {
  lng: string;
}

const InviteErrorView = ({ lng }: InviteErrorViewProps) => {
  const router = useRouter();
  const { t } = useTranslation(lng, "not-found");

  return (
    <Center>
      <Box className="flex w-full relative h-[100vh] z-20">
        <Image
          src="/assets/not-found-background.svg"
          layout="fill"
          objectFit="cover"
          sizes="100vw"
          className="relative"
          alt="not-found page background"
        />
        <Box
          display="flex"
          flexDir="column"
          alignItems="center"
          justifyContent="center"
          h="full"
          w="full"
          zIndex="10"
        >
          <DisplaySmall text={t("invite-not-valid")} textAlign={"center"} />
          <Center w={"80%"} my={"24px"}>
            <BodyXLarge
              text=""
              fontFamily="body"
              fontSize="body.xl"
              textAlign="center"
              fontWeight="regular"
              lineHeight="32"
              color="content.tertiary"
            >
              {t("invite-not-valid-description")}{" "}
              <Link
                className="underline text-nowrap"
                fontWeight="semibold"
                color="content.link"
                href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAILS}`}
              >
                {t("contact-us")}
              </Link>{" "}
            </BodyXLarge>
          </Center>
          <Button
            onClick={() => router.push(`/`)}
            gap="8px"
            h="48px"
            px="24px"
            my="24px"
            fontSize="body.md"
          >
            <Icon as={MdArrowBack} />
            {t("go-back")}
          </Button>
          ;
        </Box>
      </Box>
    </Center>
  );
};

export default InviteErrorView;
