import { Popover as Base } from "@base-ui/react/popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils.ts";
import type { Styled } from "./types.ts";

/*
 * Popover, styled on Base UI. Top layer (never clipped by an overflow container), light
 * dismiss, Escape, focus management and collision-aware positioning come from Base UI.
 *
 *   <Popover>
 *     <PopoverTrigger render={<Button variant="quiet" />}>Open</PopoverTrigger>
 *     <PopoverContent>…</PopoverContent>
 *   </Popover>
 */

export const Popover = Base.Root;
export const PopoverTrigger = Base.Trigger;
export const PopoverClose = Base.Close;

/** The surface every popover shares: menus, filters, inline confirmations. */
export const popoverSurface =
  "rounded-lg border border-line bg-paper text-sm text-ink shadow-pop outline-none";

export function PopoverContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  collisionPadding = 8,
  children,
  ...props
}: Styled<typeof Base.Popup> &
  Pick<ComponentProps<typeof Base.Positioner>, "side" | "align" | "sideOffset" | "collisionPadding">) {
  return (
    <Base.Portal>
      <Base.Positioner side={side} align={align} sideOffset={sideOffset} collisionPadding={collisionPadding} className="z-50">
        <Base.Popup
          className={cn(
            popoverSurface,
            "origin-(--transform-origin) transition-[opacity,scale] duration-120 ease-out",
            "data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:scale-[0.97] data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

export function PopoverTitle({ className, ...props }: Styled<typeof Base.Title>) {
  return <Base.Title className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: Styled<typeof Base.Description>) {
  return <Base.Description className={cn("text-sm text-ink-soft", className)} {...props} />;
}
