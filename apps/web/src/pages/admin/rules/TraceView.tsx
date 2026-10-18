import { useState } from "react";
import type { RuleEvaluation } from "../../../api/rtk/index.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { display, operator } from "./model.ts";

/** What a rule set decided, and why: outputs first, then each rule and its conditions. */
export function TraceView({ result }: { result: RuleEvaluation }) {
  const outputs = Object.entries(result.outputs);
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-2xl border border-line bg-paper p-3">
        <p className="text-xs font-medium text-ink-soft">
          {result.usedDefault ? "No rule matched: the “otherwise” outputs apply" : `Matched ${result.matched.length} rule${result.matched.length === 1 ? "" : "s"}`}
          {result.version ? ` · live v${result.version}` : " · draft"}
        </p>
        {outputs.length ? (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {outputs.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-ink-soft">{k}</dt>
                <dd className="m-0 font-mono font-medium break-all">{display(v) || '""'}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-ink-soft">No outputs.</p>
        )}
      </div>
      <div className="grid gap-1.5">
        {result.trace.map((r) => (
          <RuleTrace key={r.ruleId} rule={r} initiallyOpen={r.matched || result.trace.length <= 3} />
        ))}
      </div>
    </div>
  );
}

function RuleTrace({ rule, initiallyOpen }: { rule: RuleEvaluation["trace"][number]; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const skipped = rule.enabled && !rule.conditions.length && !rule.matched;
  return (
    <div className={cn("rounded-xl border", rule.matched ? "border-lawn/50 bg-mint/50" : "border-line bg-paper")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 border-0 bg-transparent px-2.5 py-2 text-left text-sm" aria-expanded={open}>
        <Icon name="chevron" size={14} className={cn("shrink-0 text-ink-soft transition-[rotate]", open && "rotate-90")} />
        <span className={cn("min-w-0 flex-1 truncate font-medium", !rule.enabled && "text-ink-faint")}>{rule.name || rule.ruleId}</span>
        {rule.matched ? <Badge tone="green">matched</Badge> : !rule.enabled ? <Badge>off</Badge> : skipped ? <Badge>not checked</Badge> : <Badge>no</Badge>}
      </button>
      {open && rule.conditions.length ? (
        <ul className="m-0 grid list-none gap-1 border-t border-line px-2.5 py-2 text-sm">
          {rule.conditions.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-white", c.result ? "bg-lawn" : "bg-line-strong")}>
                <Icon name={c.result ? "check" : "close"} size={10} />
              </span>
              <span className="min-w-0">
                <span className="font-mono text-[0.8125rem]">
                  {c.field} {operator(c.op)?.label ?? c.op} {display(c.right)}
                </span>
                <span className="block text-xs text-ink-soft">
                  actual: <span className="font-mono text-ink">{display(c.left) || "(nothing)"}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
