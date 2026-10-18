import { useEffect, useRef } from "react";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { useReportMutation } from "../api/rtk/index.ts";
import type { ReportReceipt } from "../api/rtk/index.ts";
import { Button, IconButton } from "@/components/ui/button.tsx";
import { choice } from "@/components/ui/choice.tsx";
import { Form, FormError, SubmitButton, TextareaField } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { help, label } from "@/components/ui/label.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { cn } from "@/lib/utils.ts";

export type ReportTarget = { jokeId: string; what: "joke" } | { commentId: string; what: "comment" };

const REASONS = [
  { value: "copied", label: "It's copied", hint: "Someone else wrote it, or it's a well-known joke passed off as theirs." },
  { value: "offensive", label: "It's offensive", hint: "Hateful, cruel, or punches down at people." },
  { value: "spam", label: "It's spam", hint: "Ads, links, or the same thing over and over." },
  { value: "other", label: "Something else", hint: "Tell the curators what's wrong below." },
] as const;

const schema = z
  .object({
    reason: z.enum(["copied", "offensive", "spam", "other"]),
    note: z.string().trim().max(280, "Keep it under 280 characters."),
  })
  .refine((v) => v.reason !== "other" || v.note.length > 0, {
    path: ["note"],
    message: "Say what's wrong, so the curators know what to look for.",
  });

/**
 * Asks why something is being reported, then files it. If enough people have
 * reported it, the API hides it straight away; the reporter is told either way.
 */
export function ReportDialog({
  target,
  onClose,
  onDone,
}: {
  target: ReportTarget | null;
  onClose: () => void;
  onDone: (receipt: ReportReceipt, target: ReportTarget) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [report] = useReportMutation();
  const form = useZodForm(schema, { defaultValues: { reason: "copied", note: "" } });
  const reason = useWatch({ control: form.control, name: "reason" });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (target && !d.open) {
      // Comments are mostly reported for tone; jokes for being copied.
      form.reset({ reason: target.what === "joke" ? "copied" : "offensive", note: "" });
      d.showModal();
    }
    if (!target && d.open) d.close();
  }, [target, form]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(30rem,calc(100%-32px))] rounded-2xl border border-line bg-paper p-0 text-ink shadow-frame backdrop:bg-black/50"
      aria-labelledby="report-title"
    >
      <Form
        form={form}
        className="p-5"
        onSubmit={async ({ reason: r, note }) => {
          if (!target) return;
          const n = note || undefined;
          const body = "jokeId" in target ? { jokeId: target.jokeId, reason: r, note: n } : { commentId: target.commentId, reason: r, note: n };
          onDone(await report({ createReportRequest: body }).unwrap(), target);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="report-title" className="flex items-center gap-2 text-xl">
              <Icon name="flag" size={20} /> Report this {target?.what ?? "joke"}
            </h2>
            <p className={help}>Curators look at every report. Your name isn't shown to the author.</p>
          </div>
          <IconButton onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </IconButton>
        </div>
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className={cn(label, "mb-2")}>What's wrong with it?</legend>
          {REASONS.map((r) => (
            <label key={r.value} className={choice(reason === r.value, { className: "grid gap-0.5 rounded-lg px-3.5 py-2.5" })}>
              <input type="radio" value={r.value} {...form.register("reason")} className="sr-only" />
              <span className="font-medium">{r.label}</span>
              <span className="text-sm text-ink-soft">{r.hint}</span>
            </label>
          ))}
        </fieldset>
        <TextareaField
          name="note"
          label="Anything else?"
          optional={reason !== "other"}
          rows={3}
          maxLength={280}
          placeholder={reason === "copied" ? "Where have you seen it before?" : "Help the curators understand."}
        />
        <FormError />
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pendingLabel="Sending…">Send report</SubmitButton>
        </div>
      </Form>
    </dialog>
  );
}

