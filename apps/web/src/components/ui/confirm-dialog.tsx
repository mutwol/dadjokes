import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog.tsx";
import { button } from "./button.tsx";
import { Spinner } from "./spinner.tsx";
import { useConfirmAction } from "./use-confirm-action.ts";
import type { ConfirmProps } from "./use-confirm-action.ts";

/**
 * A modal "are you sure?" for actions that can't be taken back: deleting a workflow,
 * taking a joke down. Focus starts on Cancel, so Enter never destroys by accident.
 *
 *   <ConfirmDialog
 *     trigger={<TextButton>Delete</TextButton>}
 *     title="Delete this comment?"
 *     description="It's removed for everyone. You can't undo this."
 *     confirmLabel="Delete comment"
 *     onConfirm={() => remove(c)}
 *   />
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  onConfirm,
}: ConfirmProps) {
  const { open, onOpenChange, pending, confirm } = useConfirmAction(onConfirm);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose className={button({ variant: "quiet" })} disabled={pending}>
            {cancelLabel}
          </AlertDialogClose>
          <button type="button" className={button()} aria-busy={pending || undefined} aria-disabled={pending || undefined} onClick={() => void confirm()}>
            {pending ? <Spinner /> : null}
            {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
