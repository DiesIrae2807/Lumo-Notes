export type ToastKind = "success" | "error" | "info";

export type LumoToast = {
  id?: string;
  kind?: ToastKind;
  title: string;
  message?: string;
};

export function notify(toast: LumoToast) {
  window.dispatchEvent(
    new CustomEvent<LumoToast>("lumo-toast", {
      detail: toast,
    }),
  );
}

export function notifyError(title: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.error(`[Lumo Notes] ${title}`, error);
  }

  notify({
    kind: "error",
    title,
    message: error instanceof Error ? error.message : String(error),
  });
}
