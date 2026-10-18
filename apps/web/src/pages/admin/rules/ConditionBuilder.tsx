import { useId } from "react";
import type { RuleCondition, RuleGroup } from "../../../api/rtk/index.ts";
import { ConfirmPopover } from "@/components/ui/confirm-popover.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { field } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import { display, newCondition, newGroup, operator, operatorsFor, parseValue, typeOf } from "./model.ts";
import type { Field } from "./model.ts";

const MATCH = { all: "All", any: "Any", none: "None" } as const;
const JOINER = { all: "and", any: "or", none: "nor" } as const;

type Ctx = {
  fields: Field[];
  readOnly?: boolean;
  /** Condition ids that were true in the last test run (green) or false (grey). */
  results?: Map<string, boolean>;
  onSelect?: (path: string) => void;
};

/**
 * WHEN: a group of conditions joined by All, Any or None, with nested groups
 * (indented, with a rule down the left). Fields come from the decision point;
 * any other dotted path can be typed too.
 */
export function GroupEditor({ group, onChange, onRemove, depth = 0, ...ctx }: Ctx & { group: RuleGroup; onChange: (g: RuleGroup) => void; onRemove?: () => void; depth?: number }) {
  const setItem = (i: number, next: RuleCondition | RuleGroup | null) =>
    onChange({ ...group, items: next ? group.items.map((x, j) => (j === i ? next : x)) : group.items.filter((_, j) => j !== i) });
  return (
    <div className={cn("grid gap-2", depth > 0 && "rounded-2xl border border-line bg-fridge/60 p-2.5")}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <div className="inline-flex rounded-lg bg-fridge p-0.5" role="radiogroup" aria-label="Match">
          {(["all", "any", "none"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={group.match === m}
              disabled={ctx.readOnly}
              onClick={() => onChange({ ...group, match: m })}
              className={cn(
                "min-h-7 rounded-md border-0 px-2.5 text-sm font-medium",
                group.match === m ? "bg-paper text-ink shadow-knob" : "bg-transparent text-ink-soft hover:text-ink",
              )}
            >
              {MATCH[m]}
            </button>
          ))}
        </div>
        <span>{group.items.length ? "of these are true" : "No conditions: always true"}</span>
        {onRemove && !ctx.readOnly ? (
          <ConfirmPopover
            trigger={
              <button type="button" aria-label="Remove group" className="ml-auto grid size-8 place-items-center rounded-lg border-0 bg-transparent text-ink-soft hover:bg-tag-red/10 hover:text-tag-red-deep data-popup-open:bg-tag-red/10 data-popup-open:text-tag-red-deep">
                <Icon name="trash" size={16} />
              </button>
            }
            title="Remove this group?"
            description={group.items.length ? `Its ${group.items.length === 1 ? "condition goes" : `${group.items.length} conditions go`} with it.` : undefined}
            confirmLabel="Remove group"
            onConfirm={onRemove}
          />
        ) : null}
      </div>
      <div className="grid gap-1.5 border-l-2 border-line pl-3">
        {group.items.map((item, i) =>
          item.kind === "group" ? (
            <GroupEditor key={item.id} {...ctx} group={item} depth={depth + 1} onChange={(g) => setItem(i, g)} onRemove={() => setItem(i, null)} />
          ) : (
            <ConditionRow key={item.id} {...ctx} condition={item} joiner={i === 0 ? "Where" : JOINER[group.match]} onChange={(c) => setItem(i, c)} onRemove={() => setItem(i, null)} />
          ),
        )}
        {!ctx.readOnly ? (
          <div className="flex flex-wrap gap-1">
            <AddButton onClick={() => onChange({ ...group, items: [...group.items, newCondition(ctx.fields[0]?.path ?? "")] })}>Condition</AddButton>
            {depth < 3 ? <AddButton onClick={() => onChange({ ...group, items: [...group.items, newGroup("any", [newCondition(ctx.fields[0]?.path ?? "")])] })}>Group</AddButton> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-8 items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-sm font-medium text-ink-soft hover:bg-fridge hover:text-ink">
      <Icon name="plus" size={15} /> {children}
    </button>
  );
}

function ConditionRow({ condition: c, joiner, onChange, onRemove, fields, readOnly, results, onSelect }: Ctx & { condition: RuleCondition; joiner: string; onChange: (c: RuleCondition) => void; onRemove: () => void }) {
  const listId = useId();
  const type = typeOf(fields, c.field);
  const ops = operatorsFor(type);
  const op = operator(c.op);
  const result = results?.get(c.id);
  const unknownField = c.field && !type;
  return (
    <div
      className={cn(
        "group/row flex flex-wrap items-center gap-1.5 rounded-xl border px-2 py-1.5",
        result === true ? "border-lawn/40 bg-mint/50" : result === false ? "border-line bg-paper" : "border-transparent hover:border-line",
      )}
      onFocus={() => onSelect?.(c.field)}
    >
      <span className="w-12 shrink-0 text-right text-sm font-medium text-ink-soft">{joiner}</span>
      {result !== undefined ? (
        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-white", result ? "bg-lawn" : "bg-line-strong")} aria-label={result ? "true" : "false"}>
          <Icon name={result ? "check" : "close"} size={12} />
        </span>
      ) : null}
      <span className="relative min-w-40 flex-[1_1_10rem]">
        <input
          list={listId}
          className={field("sm", cn("w-full pr-14 font-mono text-[0.8125rem]", unknownField && "border-cream-edge"))}
          value={c.field}
          disabled={readOnly}
          placeholder="fact"
          aria-label="Fact"
          onChange={(e) => {
            const nextType = typeOf(fields, e.target.value);
            const keep = operatorsFor(nextType).some((o) => o.op === c.op);
            onChange({ ...c, field: e.target.value, op: keep ? c.op : (operatorsFor(nextType)[0]?.op ?? "eq") });
          }}
        />
        <datalist id={listId}>
          {fields.map((f) => (
            <option key={f.path} value={f.path}>
              {f.label}
            </option>
          ))}
        </datalist>
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-2xs font-medium text-ink-faint">{type ?? (c.field ? "?" : "")}</span>
      </span>
      <select
        className={field("sm", "w-40")}
        value={c.op}
        disabled={readOnly}
        aria-label="Operator"
        onChange={(e) => {
          const next = operator(e.target.value);
          const shapeChanged = next?.value !== op?.value;
          onChange({ ...c, op: e.target.value as RuleCondition["op"], value: shapeChanged ? (next?.value === "list" || next?.value === "range" ? [] : undefined) : c.value });
        }}
      >
        {(ops.some((o) => o.op === c.op) ? ops : [...ops, ...(op ? [op] : [])]).map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {op?.value !== "none" ? (
        <ValueInput
          key={`${c.id}-${c.op}`}
          value={c.value}
          type={type}
          shape={op?.value ?? "one"}
          readOnly={readOnly}
          onChange={(value) => onChange({ ...c, value })}
        />
      ) : (
        <span className="flex-[2_1_10rem]" />
      )}
      {!readOnly ? (
        <ConfirmPopover
          trigger={
            <button
              type="button"
              aria-label="Remove condition"
              className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-ink-soft opacity-60 group-hover/row:opacity-100 hover:bg-tag-red/10 hover:text-tag-red-deep focus:opacity-100 data-popup-open:bg-tag-red/10 data-popup-open:text-tag-red-deep data-popup-open:opacity-100"
            >
              <Icon name="trash" size={16} />
            </button>
          }
          title="Remove this condition?"
          confirmLabel="Remove"
          onConfirm={onRemove}
        />
      ) : null}
    </div>
  );
}

/**
 * A literal, typed as text: numbers become numbers, true/false booleans, a
 * comma-separated list for "one of", "{path}" a reference to another fact.
 */
export function ValueInput({
  value,
  type,
  shape,
  onChange,
  readOnly,
  className,
}: {
  value: unknown;
  type: ReturnType<typeof typeOf>;
  shape: "one" | "list" | "range" | "none";
  onChange: (v: unknown) => void;
  readOnly?: boolean;
  className?: string;
}) {
  if (type === "boolean" && shape === "one") {
    return (
      <select className={field("sm", cn("flex-[2_1_10rem]", className))} value={display(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")} aria-label="Value">
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      className={field("sm", cn("min-w-32 flex-[2_1_10rem] font-mono text-[0.8125rem]", className))}
      defaultValue={display(value)}
      disabled={readOnly}
      placeholder={shape === "list" ? "a, b, c" : shape === "range" ? "low, high" : type === "number" ? "0" : "value or {fact.path}"}
      aria-label="Value"
      onBlur={(e) => onChange(parseValue(e.target.value, type, shape))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
