import posthog from "posthog-js";
import { env } from "next-runtime-env";
import Cookies from "js-cookie";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

let isInitialized = false;

const CONSENT_COOKIE_NAME = "cc_analytics_consent";
const CONSENT_EXPIRY_DAYS = 365;

export function initializeAnalytics() {
  if (typeof window === "undefined" || !hasFeatureFlag(FeatureFlags.ANALYTICS_ENABLED)) {
    return;
  }

  const posthogKey = env("NEXT_PUBLIC_POSTHOG_KEY");
  const posthogHost = env("NEXT_PUBLIC_POSTHOG_HOST");

  if (!posthogKey) {
    console.warn("PostHog key not provided. Analytics disabled.");
    return;
  }

  if (!isInitialized) {
    posthog.init(posthogKey, {
      api_host: posthogHost || "https://eu.i.posthog.com",
      person_profiles: "identified_only",
      loaded: (posthog) => {
        if (process.env.NODE_ENV === "development") posthog.debug();
        
        // Check existing consent and apply it
        const consent = getAnalyticsConsent();
        if (consent === false) {
          posthog.opt_out_capturing();
        }
      },
    });
    isInitialized = true;
  }
}

export function getAnalyticsConsent(): boolean | null {
  if (typeof window === "undefined") return null;
  
  const consent = Cookies.get(CONSENT_COOKIE_NAME);
  if (consent === undefined) return null;
  return consent === "true";
}

export function setAnalyticsConsent(consent: boolean) {
  if (typeof window === "undefined") return;
  
  Cookies.set(CONSENT_COOKIE_NAME, consent.toString(), { 
    expires: CONSENT_EXPIRY_DAYS,
    sameSite: "strict"
  });
  
  if (!isInitialized) return;
  
  if (consent) {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
}

export function hasAnalyticsConsent(): boolean {
  const consent = getAnalyticsConsent();
  return consent === true;
}

export function clearAnalyticsConsent() {
  if (typeof window === "undefined") return;
  Cookies.remove(CONSENT_COOKIE_NAME);
}

function shouldTrack(): boolean {
  return hasFeatureFlag(FeatureFlags.ANALYTICS_ENABLED) && 
         isInitialized && 
         hasAnalyticsConsent();
}

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (!shouldTrack()) {
    return;
  }
  posthog.capture(eventName, properties);
}

export function identifyUser(userId: string, properties?: Record<string, any>) {
  if (!shouldTrack()) {
    return;
  }
  posthog.identify(userId, properties);
}

export function resetUser() {
  if (!shouldTrack()) {
    return;
  }
  posthog.reset();
}

export function setUserProperties(properties: Record<string, any>) {
  if (!shouldTrack()) {
    return;
  }
  posthog.people.set(properties);
}

export function trackPageView(url?: string) {
  if (!shouldTrack()) {
    return;
  }
  posthog.capture("$pageview", {
    $current_url: url || window.location.href,
  });
}

export { posthog };