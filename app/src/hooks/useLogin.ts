import { useState } from "react";
import { signIn } from "next-auth/react";
import { useParams } from "next/navigation";
import { logger } from "@/services/logger";
import { trackEvent } from "@/lib/analytics";

export type UseLoginReturn = {
  /** Starts the OIDC authorize redirect to core-identity-service. */
  loginWithIdentity: (callbackUrl?: string) => Promise<void>;
  isLoading: boolean;
  error: string;
  clearError: () => void;
};

export const useLogin = (): UseLoginReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { lng } = useParams();
  const clearError = () => setError("");

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

  return {
    loginWithIdentity,
    isLoading,
    error,
    clearError,
  };
};
