"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadCmssyRoute,
  type CmssyRouteConfig,
  type CmssyRouteData,
  type LoadCmssyRouteOptions,
} from "./components/load-cmssy-route";
import { CmssyBlocks } from "./components/cmssy-blocks";
import { CmssyLayoutRegion } from "./components/cmssy-layout-region";

export interface UseCmssyRouteOptions extends Omit<
  LoadCmssyRouteOptions,
  "path"
> {
  path?: string | string[];
}

export interface CmssyRouteState {
  data: CmssyRouteData | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

function toSegments(path: string | string[] | undefined): string[] {
  if (Array.isArray(path)) return path;
  const value =
    path ?? (typeof window === "undefined" ? "/" : window.location.pathname);
  return value.split("/").filter(Boolean);
}

export function useCmssyRoute(
  config: CmssyRouteConfig,
  options: UseCmssyRouteOptions,
): CmssyRouteState {
  const segments = useMemo(() => toSegments(options.path), [options.path]);
  const [state, setState] = useState<{
    data: CmssyRouteData | null;
    error: Error | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const request = ++latest.current;
    setState((current) => ({ ...current, error: null, loading: true }));
    loadCmssyRoute(config, { ...optionsRef.current, path: segments })
      .then((data) => {
        if (request !== latest.current) return;
        setState({ data, error: null, loading: false });
      })
      .catch((cause: unknown) => {
        if (request !== latest.current) return;
        setState({
          data: null,
          error: cause instanceof Error ? cause : new Error(String(cause)),
          loading: false,
        });
      });
  }, [
    config,
    segments.join("/"),
    options.locale,
    options.previewSecret,
    options.isPreview,
    options.regions?.join(","),
    attempt,
  ]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload };
}

export interface CmssyRouteRenderProps {
  data: CmssyRouteData;
  Blocks: () => ReactNode;
  Region: (props: { id: string }) => ReactNode;
}

export interface CmssyRouteProps extends UseCmssyRouteOptions {
  config: CmssyRouteConfig;
  children: (props: CmssyRouteRenderProps) => ReactNode;
  fallback?: ReactNode;
  notFound?: ReactNode;
  renderError?: (error: Error) => ReactNode;
}

export function CmssyRoute({
  config,
  children,
  fallback = null,
  notFound = null,
  renderError,
  ...options
}: CmssyRouteProps) {
  const { data, error, loading } = useCmssyRoute(config, options);

  if (error) return <>{renderError ? renderError(error) : null}</>;
  if (!data) return <>{loading ? fallback : null}</>;

  const shared = {
    blocks: options.blocks,
    locale: data.locale,
    defaultLocale: data.defaultLocale,
    enabledLocales: data.enabledLocales,
    forms: options.forms,
    appContext: options.appContext,
    isPreview: options.isPreview ?? false,
  };

  const Blocks = () =>
    data.page ? (
      <CmssyBlocks
        {...shared}
        page={data.page}
        pageContext={data.pageContext}
        blockData={data.blockData}
        blockContent={data.blockContent}
      />
    ) : (
      <>{notFound}</>
    );

  const Region = ({ id }: { id: string }) => (
    <CmssyLayoutRegion
      {...shared}
      groups={data.layouts}
      region={id}
      page={data.pageContext}
      blockData={data.layoutData[id]?.data}
      blockContent={data.layoutData[id]?.content}
    />
  );

  return <>{children({ data, Blocks, Region })}</>;
}

export {
  defineCmssyRouteConfig,
  type CmssyRouteConfig,
  type CmssyRouteData,
} from "./components/load-cmssy-route";
