import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ConfirmDialogRequest } from "../utils/confirm";

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const nextRequest = (event as CustomEvent<ConfirmDialogRequest>).detail;
      setRequest(nextRequest);
      window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
    };

    window.addEventListener("lumo-confirm-dialog", open);
    return () => window.removeEventListener("lumo-confirm-dialog", open);
  }, []);

  useEffect(() => {
    if (!request) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [request]);

  const close = (confirmed: boolean) => {
    if (!request) return;
    request.resolve(confirmed);
    setRequest(null);
  };

  return (
    <>
      {children}
      {request ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-night-950/55 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <section
            className="w-full max-w-md rounded-2xl border border-white/10 bg-night-900/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lumo-confirm-title"
            aria-describedby="lumo-confirm-message"
          >
            <div className="mb-5">
              <p id="lumo-confirm-title" className="text-sm font-semibold text-white">
                {request.title}
              </p>
              <p id="lumo-confirm-message" className="mt-2 text-sm leading-6 text-slate-300">
                {request.message}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                onClick={() => close(false)}
              >
                {request.cancelLabel}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium text-white transition active:scale-95 ${
                  request.variant === "danger"
                    ? "bg-[#FF4D6D] hover:bg-[#FF4D6D]/90"
                    : "bg-lumo-violet hover:bg-lumo-violet/90"
                }`}
                onClick={() => close(true)}
              >
                {request.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
