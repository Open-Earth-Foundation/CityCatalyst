/* eslint-disable i18next/no-literal-string */
import React from "react";
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

export default function ConfirmRegistrationTemplate({
  url = "/",
  user = { name: "" },
}: {
  url?: string;
  user?: { name: string };
}) {
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

      <Preview>CityCatalyst: User Registration</Preview>
      <Body style={main}>
        <Container style={container}>
          <div style={content}>
            <Img
              src={ImageURL}
              alt="City Catalyst logo"
              width="36"
              height="36"
            />
            <Text style={brandHeading}>CityCatalyst</Text>
            <Text style={heading}>Welcome to CityCatalyst</Text>
            <Text style={greeting}>Hi {user?.name},</Text>
            <Text style={paragraph}>
              Thank you for registering an account CityCatalyst. <br /> <br />{" "}
              Please activate your account by clicking this button below. <br />{" "}
              <br />
            </Text>

            <div
              style={{
                marginTop: "36px",
                marginBottom: "36px",
              }}
            >
              <Link href={url} style={urlLink}>
                ACTIVATE ACCOUNT
              </Link>
            </div>

            <Hr style={{ height: "2px", background: "#EBEBEC" }} />
            <Text style={footerText}>
              Open Earth Foundation is a nonprofit public benefit corporation
              from California, USA. EIN: 85-3261449
            </Text>
          </div>
        </Container>
      </Body>
    </Html>
  );
}

// Styles for the email template
const main = {
  backgroundColor: "#ffffff",
  paddingTop: "48px",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const content = {
  height: "100%",
  width: "100%",
  border: "1px solid #E6E7FF",
  borderTop: "8px solid #2351DC",
  padding: "48px",
};

const container = {
  margin: "0 auto",
  padding: "0px 0 0px",
  width: "600px",
  height: "auto",
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
  marginTop: "36px",
  fontWeight: "bold",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
};
