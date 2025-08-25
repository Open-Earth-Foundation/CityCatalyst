import React from "react";
import {
  Body,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { User } from "@/models/User";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export default function AdminInviteAcceptedTemplate({
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

      <Preview>{t("admin-invite-accepted.preview")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandHeading}>{t("admin-invite-accepted.brand")}</Text>
          <Text style={heading}>{t("admin-invite-accepted.title")}</Text>
          <Text style={greeting}>
            {t("admin-invite-accepted.greeting", { name: user?.name })}
          </Text>
          <Text style={paragraph}>{t("admin-invite-accepted.message")}</Text>
          
          <Section style={listContainer}>
            <Text style={listItem}>
              <span style={listNumber}>1.</span>
              <span>{t("admin-invite-accepted.step1")}</span>
            </Text>
            <Text style={listItem}>
              <span style={listNumber}>2.</span>
              <span>{t("admin-invite-accepted.step2")}</span>
            </Text>
            <Text style={listItem}>
              <span style={listNumber}>3.</span>
              <span>{t("admin-invite-accepted.step3")}</span>
            </Text>
            <Text style={listItem}>
              <span style={listNumber}>4.</span>
              <span>{t("admin-invite-accepted.step4")}</span>
            </Text>
          </Section>
          
          <Section
            style={{
              marginTop: "36px",
              marginBottom: "36px",
            }}
          >
            <Link href={url} style={urlLink}>
              {t("admin-invite-accepted.cta", { defaultValue: "Get Started" })}
            </Link>
          </Section>
          
          <Hr style={{ height: "2px", background: "#EBEBEC", marginTop: "36px", marginBottom: "24px" }} />
          
          <Text style={paragraph}>{t("admin-invite-accepted.footer-1")}</Text>
          <Text style={paragraph}>{t("admin-invite-accepted.footer-2")}</Text>
          <Text style={paragraph}>
            <strong>{t("admin-invite-accepted.footer-3")}</strong>
          </Text>
          
          <Hr style={{ height: "2px", background: "#EBEBEC", marginTop: "24px", marginBottom: "24px" }} />
          <Text style={footerText}>{t("admin-invite-accepted.footer")}</Text>
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
  paddingLeft: "36px",
  paddingRight: "36px",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
};

const listContainer = {
  marginLeft: "0px",
  marginTop: "24px",
  marginBottom: "24px",
};

const listItem = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#484848",
  marginBottom: "12px",
  display: "flex",
  alignItems: "flex-start",
};

const listNumber = {
  fontWeight: "700",
  marginRight: "8px",
  minWidth: "20px",
};