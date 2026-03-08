"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ZkLoginSession, loadZkLoginSession, clearZkLoginSession } from "@/lib/zklogin";

interface ZkLoginContextType {
  session: ZkLoginSession | null;
  setSession: (s: ZkLoginSession | null) => void;
  logout: () => void;
}

const ZkLoginContext = createContext<ZkLoginContextType>({
  session: null,
  setSession: () => {},
  logout: () => {},
});

export function ZkLoginProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<ZkLoginSession | null>(
    typeof window !== "undefined" ? loadZkLoginSession() : null
  );

  const setSession = (s: ZkLoginSession | null) => {
    setSessionState(s);
    if (s) localStorage.setItem("zk_session", JSON.stringify(s));
  };

  const logout = () => {
    clearZkLoginSession();
    setSessionState(null);
  };

  return (
    <ZkLoginContext.Provider value={{ session, setSession, logout }}>
      {children}
    </ZkLoginContext.Provider>
  );
}

export function useZkLogin() {
  return useContext(ZkLoginContext);
}
