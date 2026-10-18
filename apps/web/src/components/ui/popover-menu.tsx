import { useState } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Popover as Base } from "@base-ui/react/popover";
import { cn } from "@/lib/utils.ts";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

type TriggerRender = Extract<ComponentProps<typeof Base.Trigger>["render"], (...args: never[]) => unknown>;
type TriggerProps = Parameters<TriggerRender>[0];

/**
 * A menu or small panel anchored to a button: table filters, the "View" menu. Built on
 * <Popover>; `trigger` gets the props to spread on its button, and `children` can take
 * a `close` function for actions that should dismiss the panel.
 *
 *   <PopoverMenu label="Table view" trigger={(p) => <button type="button" {...p}>View</button>}>
 *     {(close) => <MenuItem onSelect={close}>Reset</MenuItem>}
 *   </PopoverMenu>
 */
export function PopoverMenu({
  trigger,
  children,
  align = "start",
  className,
  label,
}: {
  trigger: (props: TriggerProps) => ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  className?: string;
  /** Accessible name for the panel. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={(props) => trigger(props)} />
      <PopoverContent align={align} aria-label={label} className={cn("min-w-52 p-1", className)}>
        {typeof children === "function" ? children(close) : children}
      </PopoverContent>
    </Popover>
  );
}

/** A row in a popover menu. */
export function MenuItem({
  children,
  selected,
  onSelect,
  className,
  role = "menuitemcheckbox",
}: {
  children: ReactNode;
  selected?: boolean;
  onSelect: () => void;
  className?: string;
  role?: "menuitemcheckbox" | "menuitemradio" | "menuitem";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitem" ? undefined : Boolean(selected)}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm text-ink hover:bg-fridge focus-visible:bg-fridge",
        className,
      )}
    >
      {children}
    </button>
  );
}
