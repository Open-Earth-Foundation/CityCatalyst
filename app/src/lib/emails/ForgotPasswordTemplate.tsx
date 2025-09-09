import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export default function ForgotPasswordTemplate({
  url,
  language,
}: {
  url: string;
  language?: string;
}) {
  const t = i18next.getFixedT(language || LANGUAGES.en, "emails");

  return (
    <Html>
      <Head />
      <Preview>{t("reset-password.preview")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandHeading}>{t("reset-password.brand")}</Text>
          <Text style={heading}>{t("reset-password.title")}</Text>
          <Text style={paragraph}>{t("reset-password.message")}</Text>
          <Button href={url} style={button}>
            {t("reset-password.cta")}
          </Button>
          <Text style={paragraph}>{t("reset-password.linkText")}</Text>
          <Link href={url}>{url}</Link>
        </Container>
      </Body>
    </Html>
  );
}

// Styles for the email template
const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  width: "580px",
};

const brandHeading = {
  fontSize: "40px",
  lineHeight: "1.5",
  fontWeight: "700",
  color: "#2351DC",
};

const heading = {
  fontSize: "32px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#484848",
};

const paragraph = {
  fontSize: "18px",
  lineHeight: "1.4",
  color: "#484848",
};

const button = {
  fontSize: "18px",
  padding: "16px",
  backgroundColor: "#2351DC",
  borderRadius: "0.5em",
  lineHeight: 1.5,
  color: "#FFF",
};
