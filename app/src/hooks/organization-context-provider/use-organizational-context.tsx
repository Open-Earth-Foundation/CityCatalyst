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
};

type OrganizationContextType = {
  organization: OrganizationState;
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
  const [organization, setOrganizationState] = useState<OrganizationState>({
    logoUrl: null,
    active: true,
  });

  const [showFrozenModal, setShowFrozenModal] = useState(false);
  const [showFrozenBanner, setShowFrozenBanner] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("organization");
    if (stored) {
      const parsed = JSON.parse(stored) as OrganizationState;
      setOrganizationState((prev) => {
        const hasChanged =
          prev.logoUrl !== parsed.logoUrl || prev.active !== parsed.active;
        return hasChanged ? parsed : prev;
      });
    }
  }, []);

  const setOrganization = (updates: Partial<OrganizationState>) => {
    setOrganizationState((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem("organization", JSON.stringify(next));
      return next;
    });
  };

  const clearOrganization = () => {
    setOrganizationState({ logoUrl: null, active: false });
    localStorage.removeItem("organization");
    setShowFrozenBanner(false);
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
