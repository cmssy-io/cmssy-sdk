"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface CmssyAuthUser {
  recordId: string;
  email: string;
}

export interface CmssyAuthActionResult {
  ok: boolean;
  message?: string;
}

export interface CmssyAuthState {
  user: CmssyAuthUser | null;
  loading: boolean;
  signIn(identity: string, password: string): Promise<CmssyAuthActionResult>;
  register(
    identity: string,
    password: string,
    fields?: Record<string, unknown>,
  ): Promise<CmssyAuthActionResult>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

const CmssyAuthContext = createContext<CmssyAuthState | null>(null);

export interface CmssyAuthProviderProps {
  children: ReactNode;
  basePath?: string;
}

export function CmssyAuthProvider({
  children,
  basePath = "/api/cmssy/auth",
}: CmssyAuthProviderProps) {
  const [user, setUser] = useState<CmssyAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const base = useMemo(() => basePath.replace(/\/+$/, ""), [basePath]);

  const fetchUser = useCallback(async (): Promise<CmssyAuthUser | null> => {
    try {
      const res = await fetch(`${base}/me`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json()) as { user?: CmssyAuthUser | null };
      return data.user ?? null;
    } catch {
      return null;
    }
  }, [base]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const next = await fetchUser();
      if (active) {
        setUser(next);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchUser]);

  const postAction = useCallback(
    async (action: string, body: Record<string, unknown>) => {
      const res = await fetch(`${base}/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as {
        ok?: boolean;
        message?: string;
        user?: CmssyAuthUser | null;
      };
    },
    [base],
  );

  const signIn = useCallback(
    async (identity: string, password: string) => {
      const data = await postAction("sign-in", { identity, password });
      if (data.ok && data.user) setUser(data.user);
      return { ok: Boolean(data.ok), message: data.message };
    },
    [postAction],
  );

  const register = useCallback(
    async (
      identity: string,
      password: string,
      fields?: Record<string, unknown>,
    ) => {
      const data = await postAction("register", {
        identity,
        password,
        fields: fields ?? {},
      });
      return { ok: Boolean(data.ok), message: data.message };
    },
    [postAction],
  );

  const signOut = useCallback(async () => {
    try {
      await postAction("sign-out", {});
    } finally {
      setUser(null);
    }
  }, [postAction]);

  const refresh = useCallback(async () => {
    setUser(await fetchUser());
  }, [fetchUser]);

  const value = useMemo<CmssyAuthState>(
    () => ({ user, loading, signIn, register, signOut, refresh }),
    [user, loading, signIn, register, signOut, refresh],
  );

  return (
    <CmssyAuthContext.Provider value={value}>
      {children}
    </CmssyAuthContext.Provider>
  );
}

export function useCmssyUser(): CmssyAuthState {
  const ctx = useContext(CmssyAuthContext);
  if (!ctx) {
    throw new Error("useCmssyUser must be used within <CmssyAuthProvider>");
  }
  return ctx;
}
