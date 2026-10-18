import { AlertDialog as Base } from "@base-ui/react/alert-dialog";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";
import type { Styled } from "./types.ts";

/*
 * Alert dialog, styled on Base UI: a modal that needs an answer before the page can be
 * used again. Clicking the backdrop doesn't dismiss it; Escape and Cancel do. For the
 * common "are you sure?" case use <ConfirmDialog> instead of assembling the parts.
 */

export const AlertDialog = Base.Root;
export const AlertDialogTrigger = Base.Trigger;
export const AlertDialogClose = Base.Close;

export function AlertDialogContent({ className, children, ...props }: Styled<typeof Base.Popup>) {
  return (
    <Base.Portal>
      <Base.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-160 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
      <Base.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[min(28rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-line bg-paper p-5 text-ink shadow-frame outline-none",
          "transition-[opacity,scale] duration-160 ease-out data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:scale-[0.97] data-ending-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </Base.Popup>
    </Base.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-1.5", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse gap-2 xs:flex-row xs:justify-end", className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: Styled<typeof Base.Title>) {
  return <Base.Title className={cn("text-lg font-semibold", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: Styled<typeof Base.Description>) {
  return <Base.Description className={cn("text-sm text-ink-soft", className)} {...props} />;
}
