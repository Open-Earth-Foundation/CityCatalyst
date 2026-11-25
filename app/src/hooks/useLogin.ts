import { useState } from "react";
import { signIn } from "next-auth/react";
import { useParams } from "next/navigation";
import { logger } from "@/services/logger";
import { trackEvent, identifyUser } from "@/lib/analytics";
import { isIdentityLoginEnabledClient } from "@/lib/identity-config";

export type LoginData = {
  email: string;
  password: string;
  securityToken?: string;
};

export type UseLoginReturn = {
  login: (
    data: LoginData,
    callbackUrl?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Starts the OIDC authorize redirect when IDENTITY_SERVICE_LOGIN is on. */
  loginWithIdentity: (callbackUrl?: string) => Promise<void>;
  isLoading: boolean;
  error: string;
  clearError: () => void;
  identityLoginEnabled: boolean;
};

export const useLogin = (): UseLoginReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { lng } = useParams();
  const clearError = () => setError("");
  const identityLoginEnabled = isIdentityLoginEnabledClient();

  const loginWithIdentity = async (callbackUrl?: string): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      trackEvent("user_logged_in", { method: "identity" });
      await signIn("identity", {
        callbackUrl: callbackUrl || `/${lng}/cities`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to start identity sign-in:");
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  const login = async (
    data: LoginData,
    callbackUrl?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (identityLoginEnabled) {
      await loginWithIdentity(callbackUrl);
      return { success: true };
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
        securityToken: data.securityToken,
        callbackUrl: callbackUrl || `/${lng}/cities`,
      });

      if (result?.error) {
        logger.error({ err: result.error }, "Sign in failure:");
        const errorMessage =
          result.error === "rate-limited"
            ? "too-many-login-attempts"
            : "invalid-email-or-password";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      if (result?.ok) {
        // Track successful login
        trackEvent("user_logged_in", { method: "credentials" });
        identifyUser(data.email);

        // Full page redirect after successful login
        window.location.href = callbackUrl || `/${lng}/cities`;
        return { success: true };
      }

      return { success: false, error: "Unknown error occurred" };
    } catch (err) {
      logger.error({ err }, "Failed to sign in:");
      const errorMessage = "An unexpected error occurred";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    login,
    loginWithIdentity,
    isLoading,
    error,
    clearError,
    identityLoginEnabled,
  };
};
