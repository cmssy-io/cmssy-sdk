"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  initialUser?: CmssyAuthUser | null;
}

export function CmssyAuthProvider({
  children,
  basePath = "/api/cmssy/auth",
  initialUser,
}: CmssyAuthProviderProps) {
  const seeded = initialUser !== undefined;
  const [user, setUser] = useState<CmssyAuthUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(!seeded);
  const generation = useRef(0);

  const base = useMemo(() => basePath.replace(/\/+$/, ""), [basePath]);

  const commitUser = useCallback((next: CmssyAuthUser | null) => {
    generation.current += 1;
    setUser(next);
  }, []);

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
    if (seeded) return;
    const gen = generation.current;
    void (async () => {
      const next = await fetchUser();
      if (gen === generation.current) {
        setUser(next);
        setLoading(false);
      }
    })();
  }, [fetchUser, seeded]);

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
      if (data.ok && data.user) commitUser(data.user);
      return { ok: Boolean(data.ok), message: data.message };
    },
    [postAction, commitUser],
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
      commitUser(null);
    }
  }, [postAction, commitUser]);

  const refresh = useCallback(async () => {
    const gen = generation.current;
    const next = await fetchUser();
    if (gen === generation.current) setUser(next);
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
