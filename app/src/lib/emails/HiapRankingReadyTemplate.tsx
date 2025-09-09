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
import { ACTION_TYPES, LANGUAGES } from "@/util/types";
import { User } from "@/models/User";
import { AppSession } from "@/lib/auth";

export default function HiapRankingReadyTemplate({
  user,
  actionType,
  language,
  url,
}: {
  user: User;
  actionType: ACTION_TYPES;
  language?: string;
  url: string;
}) {
  const t = i18next.getFixedT(language || LANGUAGES.en, "emails");

  return (
    <Html>
      <Head />
      <Preview>{t("hiap-ranking-ready.preview")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>{t("hiap-ranking-ready.title")}</Text>
          <Text style={greeting}>
            {t("hiap-ranking-ready.greeting", { name: user?.name })}
          </Text>
          <Text style={paragraph1}>{t("hiap-ranking-ready.message")}</Text>
          <Text style={paragraph2}>{t("hiap-ranking-ready.message2")}</Text>
          <Text style={paragraph3}>{t("hiap-ranking-ready.message3")}</Text>
          <Button style={button} href={`${url}`}>
            {t("hiap-ranking-ready.cta")}
          </Button>
          <Text style={footerText}>{t("hiap-ranking-ready.footer")}</Text>
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

const greeting = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#232640",
};

const paragraph1 = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#232640",
  fontWeight: "500",
  marginBottom: "16px",
  marginTop: "16px",
};

const paragraph2 = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#232640",
  fontWeight: "500",
  marginBottom: "16px",
  marginTop: "16px",
};

const paragraph3 = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#232640",
  fontWeight: "500",
  marginBottom: "16px",
  marginTop: "16px",
};

const heading = {
  fontSize: "24px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#2351DC",
};

const button = {
  fontSize: "18px",
  padding: "16px",
  backgroundColor: "#2351DC",
  borderRadius: "0.5em",
  lineHeight: 1.5,
  color: "#FFF",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
  marginTop: "36px",
  borderTop: "1px solid #EBEBEC",
};
