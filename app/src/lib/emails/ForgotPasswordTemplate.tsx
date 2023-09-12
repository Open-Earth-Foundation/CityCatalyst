import { Html } from "@react-email/html";
import { Text } from "@react-email/text";
import { Section } from "@react-email/section";
import { Container } from "@react-email/container";
import { Button } from "@react-email/button";
import { Link } from "@react-email/link";

export default function ForgotPasswordTemplate({ url }: { url: string }) {
  return (
    <Html>
      <Section style={main}>
        <Container style={container}>
          <Text style={brandHeading}>CityCatalyst</Text>
          <Text style={heading}>Forgot your password?</Text>
          <Text style={paragraph}>Reset it using this link:</Text>
          <Button href={url} style={button}>
            Reset Password
          </Button>
          <Text style={paragraph}>
            Or copy this link to your browser&apos;s URL bar:
          </Text>
          <Link href={url}>{url}</Link>
        </Container>
      </Section>
    </Html>
  );
}

// Styles for the email template
const main = {
  backgroundColor: "#ffffff",
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  width: "580px",
};

const brandHeading = {
  fontSize: "40px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#2351DC",
}

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
  backgroundColor: "#2351DC",
  borderRadius: "0.5em",
  lineHeight: 1.5,
  padding: "0.75em 1.5em",
  color: "#FFF",
};
