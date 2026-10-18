import { useEffect, useId, useRef, useState } from "react";
import { problemMessage, useSimulateTipPromptMutation } from "../api/rtk/index.ts";
import type { SimulateTipPromptRequest, Tip } from "../api/rtk/index.ts";
import { Icon } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { ksh } from "./tipTiers.ts";

type Answer = SimulateTipPromptRequest["answer"];

/**
 * Test mode only (the API's fake M-Pesa). Stands in for the PIN prompt that
 * pops up on the tipper's phone: any 4-digit PIN approves, or pick a failure
 * to see how the app handles it. The answer goes to the API as Safaricom's
 * callback would, so the tip settles through the real path.
 */
export function SimulatedMpesaPrompt({ tip, onClose }: { tip: Tip | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pinId = useId();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [simulate, { isLoading }] = useSimulateTipPromptMutation();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (tip && !d.open) {
      setPin("");
      setError(null);
      d.showModal();
    }
    if (!tip && d.open) d.close();
  }, [tip]);

  const answer = async (a: Answer) => {
    if (!tip) return;
    setError(null);
    try {
      await simulate({ id: tip.id, simulateTipPromptRequest: { answer: a } }).unwrap();
      onClose();
    } catch (e) {
      setError(problemMessage(e, "Couldn't send that. Try again."));
    }
  };

  const pinOk = /^\d{4}$/.test(pin);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(22rem,calc(100%-32px))] overflow-hidden rounded-2xl border-0 bg-transparent p-0 shadow-frame backdrop:bg-black/60"
      aria-labelledby={`${pinId}-title`}
    >
      <div className="theme-light grid bg-[#f4f4f4] text-[#1a1a1a]">
        <p className="flex items-center justify-center gap-1.5 bg-butter px-3 py-1.5 text-xs font-semibold text-butter-ink">
          <Icon name="alert" size={14} /> Test mode: no real money moves
        </p>
        <form
          className="grid gap-4 px-5 pt-5 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pinOk) void answer("approve");
          }}
        >
          <div className="grid gap-1.5">
            <h2 id={`${pinId}-title`} className="text-base font-semibold">
              M-Pesa
            </h2>
            <p className="text-[0.9375rem] leading-snug">
              Do you want to pay <strong>{tip ? ksh(tip.amountKes) : ""}</strong> to <strong>DADDY JOKES</strong>? Enter your M-Pesa PIN.
            </p>
            <p className="text-xs text-[#5c5c5c]">Prompt sent to the number ending {tip?.phoneLast3}. Any 4 digits work here.</p>
          </div>
          <label className="sr-only" htmlFor={pinId}>
            M-Pesa PIN
          </label>
          <input
            id={pinId}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-12 w-full rounded-md border border-[#b9b9b9] bg-white text-center text-2xl tracking-[0.6em] outline-none focus:border-[#1a1a1a]"
            placeholder="••••"
            autoFocus
          />
          {error ? (
            <p className="text-sm font-medium text-[#b82a2d]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="min-h-11 rounded-md border border-[#b9b9b9] bg-white font-medium disabled:opacity-50"
              onClick={() => void answer("cancel")}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={cn("min-h-11 rounded-md bg-[#1a1a1a] font-medium text-white disabled:opacity-40")}
              disabled={!pinOk || isLoading}
              aria-busy={isLoading || undefined}
            >
              {isLoading ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
        <div className="grid gap-1.5 border-t border-[#dcdcdc] px-5 py-3 text-xs text-[#5c5c5c]">
          <span>Try what happens when it goes wrong:</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <SimLink onClick={() => void answer("insufficient_funds")} disabled={isLoading}>
              Not enough balance
            </SimLink>
            <SimLink onClick={() => void answer("wrong_pin")} disabled={isLoading}>
              Wrong PIN
            </SimLink>
            <SimLink onClick={onClose} disabled={isLoading}>
              Don't answer
            </SimLink>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function SimLink({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: string }) {
  return (
    <button
      type="button"
      className="border-0 bg-transparent p-0 font-medium text-[#1a1a1a] underline decoration-[#1a1a1a]/40 underline-offset-2 disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
