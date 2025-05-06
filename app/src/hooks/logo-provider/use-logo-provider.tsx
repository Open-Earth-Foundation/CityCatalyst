import React, { createContext, useContext, useEffect, useState } from "react";

type LogoContextType = {
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
};

const LogoContext = createContext<LogoContextType | undefined>(undefined);

export const LogoProvider = ({ children }: { children: React.ReactNode }) => {
  const [logoUrl, setLogoUrlState] = useState<string | null>(null);

  // On mount, sync with localStorage
  useEffect(() => {
    const storedLogo = localStorage.getItem("app.logoUrl");
    if (storedLogo !== null) {
      setLogoUrlState(storedLogo);
    }
  }, []);

  // Update both state and localStorage
  const setLogoUrl = (url: string | null) => {
    setLogoUrlState(url);
    if (url === null) {
      localStorage.removeItem("app.logoUrl");
    } else {
      localStorage.setItem("app.logoUrl", url);
    }
  };

  return (
    <LogoContext.Provider value={{ logoUrl, setLogoUrl }}>
      {children}
    </LogoContext.Provider>
  );
};

// Hook for easy use
export const useLogo = () => {
  const context = useContext(LogoContext);
  if (!context) {
    throw new Error("useLogo must be used within a LogoProvider");
  }
  return context;
};
