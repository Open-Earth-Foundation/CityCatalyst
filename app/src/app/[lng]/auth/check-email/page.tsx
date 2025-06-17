"use client";

import { useTranslation } from "@/i18n/client";
import { Link } from "@chakra-ui/react";
import { Button, Heading, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";

function DynamicContent({ t }: { t: Function }) {
  const searchParams = useSearchParams();
  const email = searchParams.get("email_address");
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

export default function CheckEmail(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  const { t } = useTranslation(lng, "auth");
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const queryParams = Object.fromEntries(searchParams.entries());
  const queryParamsString = new URLSearchParams(queryParams).toString();
  const callbackParam = callbackUrl ? "&" : "";
  const nextCallbackUrl = `/auth/login?${callbackParam}${queryParamsString}`;
  return (
    <>
      <Heading size="xl">{t("check-email-heading")}</Heading>
      <Suspense>
        <DynamicContent t={t} />
      </Suspense>
      <NextLink href={nextCallbackUrl}>
        <Button h={16} width="full" mt={4}>
          {t("back-to-login")}
        </Button>
      </NextLink>
    </>
  );
}
