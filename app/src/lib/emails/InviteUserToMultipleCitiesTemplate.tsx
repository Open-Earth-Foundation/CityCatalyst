import { City } from "@/models/City";
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
} from "react-email";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export function InviteUserToMultipleCitiesTemplate({
  url,
  email,
  name,
  cities,
  brandInformation,
  language,
}: {
  url?: string;
  email: string;
  name?: string;
  cities: City[];
  brandInformation?: {
    color: string;
    logoUrl: string;
  };
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

      <Preview>{t("invite-multiple.subject")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            {brandInformation ? (
              <Section
                style={{
                  backgroundColor: brandInformation.color || "#ffffff",
                  paddingLeft: "24px",
                  paddingRight: "24px",
                }}
              >
                {brandInformation.logoUrl ? (
                  <Img src={brandInformation.logoUrl} alt="logo" height="100" />
                ) : (
                  <Text
                    style={{
                      ...brandHeading,
                      ...(brandInformation.color ? { color: "#ffffff" } : {}),
                    }}
                  >
                    {t("invite-multiple.brand")}
                  </Text>
                )}
              </Section>
            ) : (
              <Section style={{ padding: "24px", paddingBottom: "0" }}>
                <Text style={brandHeading}>{t("invite-multiple.brand")}</Text>
              </Section>
            )}
            <Section style={{ padding: "24px" }}>
              <Text style={heading}>{t("invite-multiple.title")}</Text>
              <Text style={greeting}>
                {t("invite-multiple.greeting", { name: name || email })}
              </Text>
              <Text style={paragraph}>{t("invite-multiple.message")}</Text>
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
                  {t("invite-multiple.cta")}
                </Link>
              </Section>
            </Section>
          </Section>
          <Text style={footerText}>{t("invite-multiple.expiry")}</Text>
          <Hr style={{ height: "2px", background: "#EBEBEC" }} />
          <Text style={footerText}>{t("invite-multiple.footer")}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteUserToMultipleCitiesTemplate;

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

// Matches the theme's body.lg / regular / 24 / wide tokens (app-theme.ts)
const bodyLarge = {
  fontFamily: '"Open Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
  fontSize: "16px",
  lineHeight: "24px",
  fontWeight: "400",
  letterSpacing: "0.5px",
  color: "#00001F", // theme content.primary
};

const greeting = bodyLarge;

const paragraph = bodyLarge;

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

// Matches the theme's title.lg / semibold / 28 tokens (app-theme.ts)
const heading = {
  fontFamily:
    'Poppins,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
  fontSize: "22px",
  lineHeight: "28px",
  fontWeight: "600",
  color: "#00001F", // theme content.primary
  marginTop: "50px",
};
