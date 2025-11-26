import { useState } from "react";
import { signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { logger } from "@/services/logger";
import { trackEvent, identifyUser } from "@/lib/analytics";

export type LoginData = {
  email: string;
  password: string;
};

export type UseLoginReturn = {
  login: (
    data: LoginData,
    callbackUrl?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
  error: string;
  clearError: () => void;
};

export const useLogin = (): UseLoginReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { lng } = useParams();
  const clearError = () => setError("");

  const login = async (
    data: LoginData,
    callbackUrl?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
        callbackUrl: callbackUrl || `/${lng}/cities`,
      });

      if (result?.error) {
        logger.error({ err: result.error }, "Sign in failure:");
        const errorMessage = "Invalid email or password";
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

  return { login, isLoading, error, clearError };
};
