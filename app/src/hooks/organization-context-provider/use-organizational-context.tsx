import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import AccountFrozenWarningModal from "@/components/Modals/account-frozen-warning-modal";

type OrganizationState = {
  logoUrl: string | null;
  active: boolean;
  organizationId?: string;
};

/**
 * Normalizes organization data from API response to OrganizationState
 */
export const normalizeOrganizationState = (
  orgData: {
    logoUrl?: string | null;
    active?: boolean;
    organizationId?: string;
  } | null,
): OrganizationState => {
  return {
    logoUrl: orgData?.logoUrl ?? null,
    active: orgData?.active ?? true,
    organizationId: orgData?.organizationId,
  };
};

/**
 * Checks if organization state has changed by comparing all properties
 */
export const hasOrganizationChanged = (
  prev: OrganizationState | null,
  next: Partial<OrganizationState>,
): boolean => {
  if (!prev) return true;
  return (Object.keys(next) as Array<keyof OrganizationState>).some(
    (key) => prev[key] !== next[key],
  );
};

type OrganizationContextType = {
  organization: OrganizationState | null;
  setOrganization: (org: Partial<OrganizationState>) => void;
  isFrozenCheck: () => boolean;
  clearOrganization: () => void;
};

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined,
);

export const OrganizationContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [organization, setOrganizationState] =
    useState<OrganizationState | null>({
      logoUrl: null,
      active: true,
      organizationId: undefined,
    });

  const [showFrozenModal, setShowFrozenModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("organization");
    if (stored) {
      const parsed = JSON.parse(stored) as OrganizationState;
      setOrganizationState((prev) => {
        return hasOrganizationChanged(prev, parsed) ? parsed : prev;
      });
    }
  }, []);

  const setOrganization = (updates: Partial<OrganizationState>) => {
    setOrganizationState((prev) => {
      const baseState = prev || {
        logoUrl: null,
        active: true,
        organizationId: undefined,
      };
      const next = { ...baseState, ...updates };
      localStorage.setItem("organization", JSON.stringify(next));
      return next;
    });
  };

  const clearOrganization = () => {
    setOrganizationState(null);
    localStorage.removeItem("organization");
  };

  const isFrozenCheck = (): boolean => {
    if (organization && !organization?.active) {
      setShowFrozenModal(true);
      return true;
    } else {
      setShowFrozenModal(false);
      return false;
    }
  };

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        setOrganization,
        isFrozenCheck,
        clearOrganization,
      }}
    >
      {children}
      <AccountFrozenWarningModal
        isOpen={showFrozenModal}
        onOpenChange={setShowFrozenModal}
        closeFunction={() => setShowFrozenModal(false)}
      />
    </OrganizationContext.Provider>
  );
};

export const useOrganizationContext = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider",
    );
  }
  return context;
};
