"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  body?: string;
  action?: ToastAction;
  duration: number;
};

type ToastInput = Omit<Partial<Toast>, "id"> & { title: string };

type ToastContextValue = {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, opts?: Partial<ToastInput>) => string;
  error: (title: string, opts?: Partial<ToastInput>) => string;
  info: (title: string, opts?: Partial<ToastInput>) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idSeed = useId();

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput): string => {
      const id = `${idSeed}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: Toast = {
        id,
        variant: input.variant ?? "info",
        title: input.title,
        body: input.body,
        action: input.action,
        duration: input.duration ?? DEFAULT_DURATION,
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration > 0) {
        const timer = setTimeout(() => dismiss(id), toast.duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss, idSeed],
  );

  const success = useCallback(
    (title: string, opts: Partial<ToastInput> = {}) =>
      push({ ...opts, title, variant: "success" }),
    [push],
  );
  const error = useCallback(
    (title: string, opts: Partial<ToastInput> = {}) =>
      push({ ...opts, title, variant: "error", duration: opts.duration ?? 6000 }),
    [push],
  );
  const info = useCallback(
    (title: string, opts: Partial<ToastInput> = {}) =>
      push({ ...opts, title, variant: "info" }),
    [push],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss, success, error, info }}>
      {children}
    </ToastContext.Provider>
  );
}

const noopId = () => "";
const NOOP_TOAST: ToastContextValue = {
  toasts: [],
  push: noopId,
  dismiss: () => {},
  success: noopId,
  error: noopId,
  info: noopId,
};

export function useToast(): ToastContextValue {
  // Safe fallback if a component happens to render outside the provider
  // (e.g. an isolated test, or a tree branch that bypasses the layout).
  return useContext(ToastContext) ?? NOOP_TOAST;
}
