import type { ComponentProps } from "react";
import { Popover as Base } from "@base-ui/react/popover";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "./popover.tsx";
import { button } from "./button.tsx";
import { Spinner } from "./spinner.tsx";
import { useConfirmAction } from "./use-confirm-action.ts";
import type { ConfirmProps } from "./use-confirm-action.ts";

/**
 * A small confirmation anchored to its button, for removals inside an editor (a rule,
 * a condition, a step) where a full modal would be heavy but one stray click
 * shouldn't lose work.
 *
 *   <ConfirmPopover
 *     trigger={<IconBtn label="Delete rule" icon="trash" />}
 *     title="Delete this rule?"
 *     confirmLabel="Delete"
 *     onConfirm={() => setRule(i, null)}
 *   />
 */
export function ConfirmPopover({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  onConfirm,
  side = "bottom",
  align = "end",
}: ConfirmProps & Pick<ComponentProps<typeof Base.Positioner>, "side" | "align">) {
  const { open, onOpenChange, pending, confirm } = useConfirmAction(onConfirm);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side={side} align={align} role="alertdialog" className="grid w-64 max-w-(--available-width) gap-3 p-3">
        <div className="grid gap-1">
          <PopoverTitle>{title}</PopoverTitle>
          {description ? <PopoverDescription>{description}</PopoverDescription> : null}
        </div>
        <div className="flex justify-end gap-2">
          <PopoverClose className={button({ variant: "quiet", size: "sm" })} disabled={pending}>
            {cancelLabel}
          </PopoverClose>
          <button type="button" className={button({ size: "sm" })} aria-busy={pending || undefined} aria-disabled={pending || undefined} onClick={() => void confirm()}>
            {pending ? <Spinner /> : null}
            {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
