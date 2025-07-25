import React from "react";
import {
  Body,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export function RoleUpdateNotificationTemplate({
  url,
  email,
  organizationName,
  brandInformation,
  language,
}: {
  url?: string;
  email: string;
  organizationName: string;
  brandInformation?: {
    color: string;
    logoUrl: string;
  };
  language?: string;
}) {
  const t = i18next.getFixedT(language || LANGUAGES.en, "emails");
  const ImageURL = "https://citycatalyst.openearth.dev/assets/icon.png";
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Roboto"
          fallbackFontFamily="Verdana"
          webFont={{
            url: "https://fonts.gstatic.com/s/roboto/v27/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>

      <Preview>{t("role-update.preview")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            {brandInformation ? (
              <Section
                style={{
                  backgroundColor: brandInformation.color || "#ffffff",
                }}
              >
                <Img
                  src={brandInformation.logoUrl ?? ImageURL}
                  alt="logo"
                  height="100"
                />
              </Section>
            ) : (
              <Section>
                <Img
                  src={ImageURL}
                  alt="City Catalyst logo"
                  width="36"
                  height="36"
                />
                <Text style={brandHeading}>{t("role-update.brand")}</Text>
              </Section>
            )}
            <Section style={{ padding: "24px" }}>
              <Text style={headingGreen}>{t("role-update.title")}</Text>
              <Text style={greeting}>
                {t("role-update.greeting", { email })}
              </Text>
              <Text style={paragraph}>
                {t("role-update.message", { organizationName })}
              </Text>
              <Section style={buttonSection}>
                <Link
                  href={url}
                  style={{
                    ...urlLink,
                    ...(brandInformation?.color
                      ? { backgroundColor: brandInformation?.color }
                      : {}),
                  }}
                >
                  {t("role-update.cta")}
                </Link>
              </Section>
            </Section>
          </Section>
          <Hr style={{ height: "2px", background: "#EBEBEC" }} />
          <Text style={footerText}>{t("role-update.footer")}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default RoleUpdateNotificationTemplate;

const buttonSection = {
  marginTop: "36px",
  marginBottom: "36px",
};

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
  fontSize: "20px",
  lineHeight: "1.5",
  fontWeight: "700",
  color: "#2351DC",
};

const heading = {
  fontSize: "24px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#484848",
  marginTop: "50px",
};

const greeting = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#484848",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#484848",
};

const urlLink = {
  fontSize: "14px",
  padding: "16px",
  backgroundColor: "#2351DC",
  borderRadius: "100px",
  lineHeight: 1.5,
  color: "#FFF",
  display: "inline-block",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
};

const cityBox = {
  display: "flex",
  padding: "16px",
  alignItems: "center",
  gap: "16px",
  borderRadius: "8px",
  border: "1px solid #E6E7FF",
  margin: "32px",
};

const cityNameText = {
  fontSize: "14px",
  fontStyle: "normal",
  fontWeight: "500",
  lineHeight: "32px", // Match this with the flag height
  letterSpacing: "0.5px",
  color: "#484848",
};

const headingGreen = {
  fontSize: "24px",
  lineHeight: "32px",
  fontWeight: "700",
  color: "#24BE00",
  marginTop: "50px",
};
