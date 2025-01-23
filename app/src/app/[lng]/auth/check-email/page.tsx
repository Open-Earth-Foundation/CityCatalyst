"use client";

import { useTranslation } from "@/i18n/client";
import { Link } from "@chakra-ui/react";
import { Button, Heading, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function DynamicContent({ t }: { t: Function }) {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const isReset = !!searchParams.get("reset");

  return isReset ? (
    <Text my={4} color="#7A7B9A">
      {t("check-email-reset-prefix")}{" "}
      {email ? <Link href={`mailto:${email}`}>{email}</Link> : t("your-email")}
      {t("check-email-reset-details")}
    </Text>
  ) : (
    <>
      <Text className="my-4" color="#7A7B9A">
        {t("check-email-details1")}
      </Text>
      <Text className="my-4" color="#7A7B9A">
        {email ? (
          <>
            {t("check-email-details2-prefix")}{" "}
            <Link href={`mailto:${email}`}>{email}</Link>
          </>
        ) : (
          t("in-inbox")
        )}
        {t("check-email-details2")}
      </Text>
    </>
  );
}

export default function CheckEmail({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "auth");
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  return (
    <>
      <Heading size="xl">{t("check-email-heading")}</Heading>
      <Suspense>
        <DynamicContent t={t} />
      </Suspense>
      <NextLink
        href={`/auth/login?callbackUrl=${callbackUrl}`}
        passHref
        legacyBehavior
      >
        <Button as="a" h={16} width="full" mt={4}>
          {t("back-to-login")}
        </Button>
      </NextLink>
    </>
  );
}
