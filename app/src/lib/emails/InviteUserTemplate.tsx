import React from "react";
import type { CityAttributes } from "@/models/City";
import type { UserAttributes } from "@/models/User";
import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Text,
  Img,
  Font,
  Hr,
} from "@react-email/components";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export default function InviteUserTemplate({
  url,
  user,
  city,
  invitingUser,
  members,
  language,
}: {
  url?: string;
  user?: { name: string; email: string; cityId?: string };
  city?: CityAttributes;
  invitingUser?: { name: string; email: string };
  members: UserAttributes[];
  language?: string;
}) {
  const t = i18next.getFixedT(language || LANGUAGES.en, "emails");
  const countryCode = city?.locode?.split(" ")!;

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

      <Preview>{t("invite.subject")}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={ImageURL} alt="City Catalyst logo" width="36" height="36" />
          <Text style={brandHeading}>{t("invite.brand")}</Text>
          <Text style={heading}>{t("invite.title")}</Text>
          <Text style={greeting}>
            {t("invite.greeting", { name: user?.name })}
          </Text>
          <Text style={paragraph}>
            {t("invite.message", {
              inviterName: invitingUser?.name,
              inviterEmail: invitingUser?.email,
            })}
          </Text>
          <div style={cityBox}>
            <div
              style={{
                background: `url('https://flagsapi.com/${countryCode[0]!}/flat/64.png'), no-repeat`,
                backgroundSize: "cover",
                height: "32px",
                width: "32px",
                backgroundOrigin: "content-box",
                marginTop: "28px",
                marginRight: "16px",
              }}
            />
            <div>
              <Text
                style={{
                  fontSize: "14px",
                  fontStyle: "normal",
                  fontWeight: "500",
                  lineHeight: "20px",
                  letterSpacing: "0.5px",
                }}
              >
                {city?.name}
              </Text>
              <Text
                style={{
                  fontSize: "14px",
                  fontStyle: "normal",
                  letterSpacing: "0.5px",
                  color: "#7A7B9A",
                }}
              >
                {t("invite.members", { count: members.length })}
              </Text>
            </div>
          </div>
          <div
            style={{
              marginTop: "36px",
              marginBottom: "36px",
            }}
          >
            <Link href={url} style={urlLink}>
              {t("invite.cta")}
            </Link>
          </div>

          <Hr style={{ height: "2px", background: "#EBEBEC" }} />
          <Text style={footerText}>{t("invite.footer")}</Text>
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

const cityBox = {
  display: "flex",
  paddingLeft: "16px",
  alignItems: "center",
  gap: "16px",
  height: "80px",
  borderRadius: "8px",
  border: "1px solid #E6E7FF",
  marginTop: "36px",
};

const urlLink = {
  fontSize: "14px",
  padding: "16px",
  backgroundColor: "#2351DC",
  borderRadius: "100px",
  lineHeight: 1.5,
  color: "#FFF",
  marginTop: "36px",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
};
