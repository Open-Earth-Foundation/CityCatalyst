import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import AccountFrozenWarningModal from "@/components/Modals/account-frozen-warning-modal";
import { useAppDispatch } from "@/lib/hooks";
import {
  set as setOrganizationAction,
  clear as clearOrganizationAction,
} from "@/features/organization/organizationSlice";

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
  const allKeys = new Set([
    ...Object.keys(prev || {}),
    ...Object.keys(next || {}),
  ] as Array<keyof OrganizationState>);
  return Array.from(allKeys).some((key) => prev[key] !== next[key]);
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
  const [hasHydrated, setHasHydrated] = useState(false);

  const dispatch = useAppDispatch();

  useEffect(() => {
    const stored = localStorage.getItem("organization");
    if (stored) {
      const parsed = JSON.parse(stored) as OrganizationState;
      setOrganizationState(parsed);
      dispatch(setOrganizationAction(parsed));
    }
    setHasHydrated(true);
  }, [dispatch]);

  // Keep Redux + localStorage in sync after React state commits.
  // Side effects must not run inside the setState updater (that updates
  // NavigationBar while OrganizationContextProvider is still rendering).
  useEffect(() => {
    if (!hasHydrated) return;

    if (!organization) {
      localStorage.removeItem("organization");
      dispatch(clearOrganizationAction());
      return;
    }
    localStorage.setItem("organization", JSON.stringify(organization));
    dispatch(setOrganizationAction(organization));
  }, [organization, dispatch, hasHydrated]);

  const setOrganization = (updates: Partial<OrganizationState>) => {
    setOrganizationState((prev) => {
      const baseState = prev || {
        logoUrl: null,
        active: true,
        organizationId: undefined,
      };
      return { ...baseState, ...updates };
    });
  };

  const clearOrganization = () => {
    setOrganizationState(null);
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
