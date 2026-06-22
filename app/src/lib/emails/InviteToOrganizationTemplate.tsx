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
import { Organization } from "@/models/Organization";
import { User } from "@/models/User";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export default function InviteToOrganizationTemplate({
  url,
  organization,
  user,
  language,
}: {
  url: string;
  organization: Organization;
  user: User | null;
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

      <Preview>{t("invite-organization.preview")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandHeading}>{t("invite-organization.brand")}</Text>
          <Text style={heading}>{t("invite-organization.title")}</Text>
          {user?.name ? (
            <Text style={greeting}>
              {t("invite-organization.greeting", { name: user?.name })}
            </Text>
          ) : (
            <Text style={greeting}>
              {t("invite-organization.greeting-no-name")}
            </Text>
          )}
          <Text>
            {t("invite-organization.message-prefix")}
            <strong style={bold}>
              {t("invite-organization.message-free-trial")}
            </strong>
            {t("invite-organization.message-suffix")}
          </Text>
          <Text style={paragraph}>
            {t("invite-organization.start-by")}
            <strong style={bold}>
              {t("invite-organization.setting-up-inventory")}
            </strong>
            {t("invite-organization.in-one-city")}
          </Text>
          <Section
            style={{
              marginTop: "36px",
              marginBottom: "36px",
            }}
          >
            <Link href={url} style={urlLink}>
              {t("invite-organization.cta")}
            </Link>
          </Section>
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

const bold = {
  fontWeight: "700",
  color: "#484848",
};
