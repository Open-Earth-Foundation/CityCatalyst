/* eslint-disable i18next/no-literal-string */
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

export default function ForgotPasswordTemplate({ url }: { url: string }) {
  return (
    <Html>
      <Head />
      <Preview>CityCatalyst: Reset your password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandHeading}>CityCatalyst</Text>
          <Text style={heading}>Forgot your password?</Text>
          <Text style={paragraph}>Reset it by clicking the button below:</Text>
          <Button href={url} style={button}>
            Reset Password
          </Button>
          <Text style={paragraph}>
            Or copy this link to your browser&apos;s URL bar:
          </Text>
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
