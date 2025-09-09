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
import { User } from "@/models/User";
import { Project } from "@/models/Project";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export default function AccountFrozenNotificationTemplate({
  url,
  user,
  language,
}: {
  url: string;
  user: User | null;
  language?: string;
}) {
  const t = i18next.getFixedT(language || LANGUAGES.en, "emails");
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

      <Preview>{t("account-frozen.subject")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandHeading}>{t("account-frozen.brand")}</Text>
          <Text style={headingGreen}>{t("account-frozen.title")}</Text>
          <Text style={greeting}>
            {t("account-frozen.greeting", { name: user?.name })}
          </Text>
          <Text style={paragraph}>
            {t("account-frozen.message").replace("**", "")}
          </Text>

          <Section style={{ marginTop: "32px" }}>
            <Text style={sectionHeading}>
              {t("account-frozen.ready-to-upgrade-heading")}
            </Text>
            <Text style={paragraph}>
              {t("account-frozen.ready-to-upgrade-message")}
            </Text>
            <Section style={{ marginTop: "16px", marginBottom: "24px" }}>
              <Link href={url} style={urlLink}>
                {t("account-frozen.ready-to-upgrade-cta")}
              </Link>
            </Section>
          </Section>

          <Text style={paragraph}>{t("account-frozen.ready-to-talk")}</Text>
          <Section style={{ marginTop: "16px", marginBottom: "24px" }}>
            <Link
              href="https://meetings-eu1.hubspot.com/cviaene"
              style={secondaryLink}
            >
              {t("account-frozen.ready-to-talk-cta", {
                defaultValue: "Schedule a Call",
              })}
            </Link>
          </Section>

          <Section style={{ marginTop: "32px" }}>
            <Text style={sectionHeading}>
              {t("account-frozen.Survey-heading")}
            </Text>
            <Text style={paragraph}>{t("account-frozen.survery-text")}</Text>
            <Section style={{ marginTop: "16px", marginBottom: "16px" }}>
              <Link
                href="https://form.typeform.com/to/AE7lzwlW"
                style={secondaryLink}
              >
                {t("account-frozen.survey-cta")}
              </Link>
            </Section>
            <Text style={paragraph}>
              {t("account-frozen.survery-raffle-draw")}
            </Text>
          </Section>

          <Hr
            style={{
              height: "2px",
              background: "#EBEBEC",
              marginTop: "36px",
              marginBottom: "24px",
            }}
          />

          <Text style={paragraph}>{t("account-frozen.footer-1")}</Text>
          <Text style={paragraph}>{t("account-frozen.footer-2")}</Text>
          <Text style={paragraph}>{t("account-frozen.footer-3")}</Text>
          <Text style={paragraph}>
            <strong>{t("account-frozen.footer-4")}</strong>
          </Text>

          <Hr
            style={{
              height: "2px",
              background: "#EBEBEC",
              marginTop: "24px",
              marginBottom: "24px",
            }}
          />
          <Text style={footerText}>{t("account-frozen.footer")}</Text>
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
  padding: "20px 48px 48px",
  width: "580px",
  borderTop: "2px solid #2351DC",
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

const headingGreen = {
  fontSize: "24px",
  lineHeight: "32px",
  fontWeight: "700",
  color: "#24BE00",
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
  color: "#4B4C63",
};

const sectionHeading = {
  fontSize: "16px",
  lineHeight: "1.4",
  fontWeight: "700",
  color: "#484848",
  marginTop: "16px",
  marginBottom: "8px",
};

const urlLink = {
  fontSize: "14px",
  padding: "16px",
  backgroundColor: "#2351DC",
  borderRadius: "100px",
  lineHeight: 1.5,
  color: "#FFF",
  display: "inline-block",
  paddingLeft: "36px",
  paddingRight: "36px",
};

const secondaryLink = {
  fontSize: "14px",
  padding: "12px",
  backgroundColor: "#FFFFFF",
  border: "2px solid #2351DC",
  borderRadius: "100px",
  lineHeight: 1.5,
  color: "#2351DC",
  display: "inline-block",
  paddingLeft: "28px",
  paddingRight: "28px",
  fontWeight: "600",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
};

const boldText = {
  fontWeight: "700",
};
