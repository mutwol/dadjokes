import { Toast as Base } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { Icon } from "./icon.tsx";
import type { IconName } from "./icon.tsx";
import { cn } from "@/lib/utils.ts";

/*
 * Toasts, on Base UI. One global manager, so a toast can be raised from anywhere (an
 * event handler, the store, a fetch callback) and every layout shows it in the same
 * place: bottom right, above the phone tab bar.
 *
 *   toast.success("Draft saved.");
 *   toast.error(problemMessage(e, "Couldn't save."));
 *   toast.info("Your joke arrives at 8 am.");
 *
 * Render <Toaster /> once, at the app root.
 */

const manager = Base.createToastManager();

type ToastType = "success" | "error" | "info";

interface ToastOptions {
  description?: ReactNode;
  /** ms before it closes itself; 0 keeps it until dismissed. */
  timeout?: number;
}

const DEFAULTS: Record<ToastType, { timeout: number; priority: "low" | "high" }> = {
  success: { timeout: 4000, priority: "low" },
  info: { timeout: 5000, priority: "low" },
  // Errors stay longer and are announced assertively.
  error: { timeout: 7000, priority: "high" },
};

function show(type: ToastType, title: ReactNode, { description, timeout }: ToastOptions = {}) {
  return manager.add({ type, title, description, timeout: timeout ?? DEFAULTS[type].timeout, priority: DEFAULTS[type].priority });
}

export const toast = Object.assign((title: ReactNode, options?: ToastOptions) => show("info", title, options), {
  success: (title: ReactNode, options?: ToastOptions) => show("success", title, options),
  error: (title: ReactNode, options?: ToastOptions) => show("error", title, options),
  info: (title: ReactNode, options?: ToastOptions) => show("info", title, options),
  /** Close one toast by id, or all of them. */
  dismiss: (id?: string) => manager.close(id),
});

const LOOK: Record<ToastType, { icon: IconName; badge: string }> = {
  success: { icon: "check", badge: "bg-mint text-forest" },
  error: { icon: "alert", badge: "bg-tag-red/12 text-tag-red-deep" },
  info: { icon: "info", badge: "bg-sky text-sky-ink" },
};

export function Toaster() {
  return (
    <Base.Provider toastManager={manager} limit={3}>
      <Base.Portal>
        <Base.Viewport
          className={cn(
            "fixed z-60 w-[calc(100vw-32px)] max-w-88 outline-none",
            // Clear the phone tab bar; on desktop sit in the corner.
            "right-4 bottom-[calc(var(--spacing-nav)+16px+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6",
          )}
        >
          <ToastList />
        </Base.Viewport>
      </Base.Portal>
    </Base.Provider>
  );
}

function ToastList() {
  const { toasts } = Base.useToastManager();
  return toasts.map((t) => {
    const look = LOOK[(t.type as ToastType | undefined) ?? "info"] ?? LOOK.info;
    return (
      <Base.Root
        key={t.id}
        toast={t}
        className={cn(
          // Stacked behind each other when idle; fanned out on hover or focus (data-expanded).
          "[--gap:0.625rem] [--peek:0.625rem] [--scale:calc(max(0,1-(var(--toast-index)*0.06)))] [--shrink:calc(1-var(--scale))]",
          "[--height:var(--toast-frontmost-height,var(--toast-height))]",
          "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
          "absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] h-(--height) w-full origin-bottom select-none",
          "rounded-lg border border-line bg-paper text-ink shadow-pop",
          "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
          "[transition:transform_0.45s_cubic-bezier(0.22,1,0.36,1),opacity_0.45s,height_0.15s]",
          // A hover bridge between stacked toasts, so the stack doesn't collapse while moving across the gap.
          "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
          "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
          "data-limited:opacity-0 data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0",
          "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
          "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
          "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
          "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
          "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
          "focus-visible:shadow-focus",
        )}
      >
        <Base.Content className="flex items-start gap-3 overflow-hidden py-3 pr-2 pl-3 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100">
          <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", look.badge)} aria-hidden="true">
            <Icon name={look.icon} size={14} />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5 pt-0.5">
            <Base.Title className="text-sm font-medium text-pretty" />
            <Base.Description className="text-sm text-ink-soft empty:hidden" />
          </div>
          <Base.Close
            aria-label="Dismiss"
            className="-my-1 grid size-8 shrink-0 place-items-center rounded-md border-0 bg-transparent text-ink-faint transition-colors duration-120 hover:bg-ink/6 hover:text-ink"
          >
            <Icon name="close" size={16} />
          </Base.Close>
        </Base.Content>
      </Base.Root>
    );
  });
}
