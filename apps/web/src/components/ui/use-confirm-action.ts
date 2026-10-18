import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

/**
 * Open/pending state for a confirmation: the confirm button shows a pending label while
 * `onConfirm` runs, the surface can't be dismissed mid-request, and it closes once the
 * action settles. Errors are the caller's to report (usually as a toast).
 */
export function useConfirmAction(onConfirm: () => unknown) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
      setOpen(false);
    }
  };

  const onOpenChange = (next: boolean) => {
    if (!pending) setOpen(next);
  };

  return { open, onOpenChange, pending, confirm };
}

export interface ConfirmProps {
  /** The button that asks. Rendered as-is; it must spread props and accept a ref. */
  trigger: ReactElement;
  /** A question: "Delete this comment?" */
  title: ReactNode;
  /** What happens, and whether it can be undone. */
  description?: ReactNode;
  /** The verb, repeated: "Delete comment". */
  confirmLabel: string;
  /** Shown while `onConfirm` runs: "Deleting…". */
  pendingLabel?: string;
  cancelLabel?: string;
  onConfirm: () => unknown;
}
