import { useEffect, useState, type ReactNode } from "react";
import type { LumoToast } from "../utils/toast";

type ToastItem = Required<Pick<LumoToast, "id" | "kind" | "title">> & Pick<LumoToast, "message">;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<LumoToast>).detail;
      const id = detail.id ?? crypto.randomUUID();
      const toast: ToastItem = {
        id,
        kind: detail.kind ?? "info",
        title: detail.title,
        message: detail.message,
      };

      setToasts((current) => [toast, ...current].slice(0, 4));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, detail.kind === "error" ? 7000 : 4200);
    };

    window.addEventListener("lumo-toast", onToast);
    return () => window.removeEventListener("lumo-toast", onToast);
  }, []);

  const dismiss = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  return (
    <>
      {children}
      <div className="pointer-events-none fixed right-4 top-16 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border bg-night-900/92 p-4 text-sm shadow-[0_18px_60px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl ${
              toast.kind === "error"
                ? "border-rose-400/25"
                : toast.kind === "success"
                  ? "border-lumo-teal/25"
                  : "border-white/10"
            }`}
            role={toast.kind === "error" ? "alert" : "status"}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  toast.kind === "error"
                    ? "bg-rose-300"
                    : toast.kind === "success"
                      ? "bg-lumo-teal"
                      : "bg-lumo-violet"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">{toast.title}</p>
                {toast.message ? (
                  <p className="mt-1 text-xs leading-5 text-slate-400">{toast.message}</p>
                ) : null}
              </div>
              <button
                className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/50"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
