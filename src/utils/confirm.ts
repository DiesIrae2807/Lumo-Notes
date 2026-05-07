export type ConfirmVariant = "danger" | "info";

export type ConfirmDialogOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  message: string;
  title?: string;
  variant?: ConfirmVariant;
};

type ConfirmDialogRequest = Required<ConfirmDialogOptions> & {
  resolve: (confirmed: boolean) => void;
};

const defaultOptions: Omit<Required<ConfirmDialogOptions>, "message"> = {
  cancelLabel: "Cancel",
  confirmLabel: "OK",
  title: "Confirm action",
  variant: "info",
};

export function confirmDialog(options: ConfirmDialogOptions | string) {
  const requestOptions =
    typeof options === "string" ? { message: options } : options;

  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ConfirmDialogRequest>("lumo-confirm-dialog", {
        detail: {
          ...defaultOptions,
          ...requestOptions,
          resolve,
        },
      }),
    );
  });
}

export type { ConfirmDialogRequest };
