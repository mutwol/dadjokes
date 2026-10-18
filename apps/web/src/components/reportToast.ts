import type { ReportReceipt } from "../api/rtk/index.ts";

/** What to tell the reporter afterwards. */
export function reportToast(receipt: ReportReceipt, what: "joke" | "comment") {
  if (receipt.alreadyReported) return `You've already reported this ${what}. The curators will get to it.`;
  if (receipt.hidden) return `Thanks. It's hidden for now while the curators take a look.`;
  return `Thanks. The curators will look at this ${what}, and you'll hear what they decide.`;
}
