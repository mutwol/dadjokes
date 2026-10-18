import { useState } from "react";
import type { RuleOutcome } from "../../../api/rtk/index.ts";
import { ConfirmPopover } from "@/components/ui/confirm-popover.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { field } from "@/components/ui/input.tsx";
import { display, parseValue } from "./model.ts";

/** THEN: outputs as name = value. Text values may use {{fact.path}}. */
export function OutcomesEditor({
  outcomes,
  onChange,
  suggestions,
  readOnly,
  emptyText = "No outputs.",
}: {
  outcomes: RuleOutcome[];
  onChange: (o: RuleOutcome[]) => void;
  suggestions: string[];
  readOnly?: boolean;
  emptyText?: string;
}) {
  const [listId] = useState(() => `out-${Math.random().toString(36).slice(2, 7)}`);
  const set = (i: number, next: RuleOutcome | null) => onChange(next ? outcomes.map((o, j) => (j === i ? next : o)) : outcomes.filter((_, j) => j !== i));
  return (
    <div className="grid gap-1.5">
      {outcomes.length === 0 ? <p className="text-sm text-ink-soft">{emptyText}</p> : null}
      {outcomes.map((o, i) => (
        <div key={`${i}-${o.key}`} className="group/out flex flex-wrap items-center gap-1.5">
          <span className="w-12 shrink-0 text-right text-sm font-medium text-ink-soft">{i === 0 ? "Set" : "and"}</span>
          <input
            list={listId}
            className={field("sm", "w-40 font-mono text-[0.8125rem]")}
            defaultValue={o.key}
            disabled={readOnly}
            aria-label="Output name"
            onBlur={(e) => set(i, { ...o, key: e.target.value.trim() })}
          />
          <span className="font-medium text-ink-soft">=</span>
          <input
            className={field("sm", "min-w-32 flex-1 font-mono text-[0.8125rem]")}
            defaultValue={display(o.value)}
            disabled={readOnly}
            placeholder="true, 3, or text with {{fact}}"
            aria-label="Output value"
            onBlur={(e) => set(i, { ...o, value: parseValue(e.target.value, undefined, "one") })}
          />
          {!readOnly ? (
            <ConfirmPopover
              trigger={
                <button type="button" aria-label="Remove output" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-ink-soft opacity-60 group-hover/out:opacity-100 hover:bg-tag-red/10 hover:text-tag-red-deep focus:opacity-100 data-popup-open:bg-tag-red/10 data-popup-open:text-tag-red-deep data-popup-open:opacity-100">
                  <Icon name="trash" size={16} />
                </button>
              }
              title={o.key ? `Remove the “${o.key}” output?` : "Remove this output?"}
              confirmLabel="Remove"
              onConfirm={() => set(i, null)}
            />
          ) : null}
        </div>
      ))}
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {!readOnly ? (
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1 justify-self-start rounded-lg border-0 bg-transparent px-2 text-sm font-medium text-ink-soft hover:bg-fridge hover:text-ink"
          onClick={() => onChange([...outcomes, { key: suggestions.find((s) => !outcomes.some((o) => o.key === s)) ?? "", value: true }])}
        >
          <Icon name="plus" size={15} /> Output
        </button>
      ) : null}
    </div>
  );
}
