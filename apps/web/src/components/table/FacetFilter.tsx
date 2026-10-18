import { useMemo, useState } from "react";
import { CheckMark } from "@/components/ui/check-mark.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { MenuItem, PopoverMenu } from "@/components/ui/popover-menu.tsx";
import { cn } from "@/lib/utils.ts";

export interface FacetOption {
  value: string;
  label: string;
  /** Rows with this value (client tables fill it in from TanStack facets). */
  count?: number;
}

export interface FacetFilterDef {
  /** URL key, and the column id for client tables. */
  id: string;
  label: string;
  options: readonly FacetOption[];
  /** Server filters that accept one value use `single`. */
  single?: boolean;
}

/**
 * A toolbar filter button: "Role" → a menu of options with counts. Shows the picked
 * values on the button itself so the active filters are visible without opening it.
 */
export function FacetFilter({ def, value, onChange }: { def: FacetFilterDef; value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => (query ? def.options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : def.options),
    [def.options, query],
  );
  const picked = def.options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => {
    if (def.single) return onChange(value[0] === v ? [] : [v]);
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <PopoverMenu
      label={`Filter by ${def.label}`}
      trigger={(p) => (
        <button
          type="button"
          {...p}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-120",
            picked.length ? "border-line-strong bg-paper text-ink" : "border-line-strong bg-transparent text-ink-soft hover:bg-paper hover:text-ink",
          )}
        >
          <Icon name={picked.length ? "check" : "plus"} size={14} />
          {def.label}
          {picked.length ? (
            <>
              <span className="mx-0.5 h-4 w-px bg-line-strong" aria-hidden="true" />
              {picked.length > 2 ? (
                <span className="rounded-sm bg-fridge px-1.5 text-xs">{picked.length} selected</span>
              ) : (
                picked.map((o) => (
                  <span key={o.value} className="rounded-sm bg-fridge px-1.5 text-xs">
                    {o.label}
                  </span>
                ))
              )}
            </>
          ) : null}
        </button>
      )}
    >
      {(close) => (
        <div className="grid w-60 gap-1">
          {def.options.length > 7 ? (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Find ${def.label.toLowerCase()}…`}
              aria-label={`Find ${def.label.toLowerCase()}`}
              className="m-1 mb-0 min-h-8 rounded-md border border-line bg-fridge px-2 text-sm outline-none focus:border-focus"
            />
          ) : null}
          <div role="menu" aria-label={def.label} className="grid max-h-72 overflow-y-auto">
            {shown.length ? (
              shown.map((o) => (
                <MenuItem key={o.value} role={def.single ? "menuitemradio" : "menuitemcheckbox"} selected={value.includes(o.value)} onSelect={() => toggle(o.value)}>
                  <CheckMark on={value.includes(o.value)} radio={def.single} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.count !== undefined ? <span className="text-xs text-ink-faint tabular-nums">{o.count}</span> : null}
                </MenuItem>
              ))
            ) : (
              <p className="px-2 py-3 text-center text-ink-faint">No matches</p>
            )}
          </div>
          {value.length ? (
            <div className="border-t border-line pt-1">
              <MenuItem
                role="menuitem"
                className="justify-center text-ink-soft"
                onSelect={() => {
                  onChange([]);
                  close();
                }}
              >
                Clear filter
              </MenuItem>
            </div>
          ) : null}
        </div>
      )}
    </PopoverMenu>
  );
}
