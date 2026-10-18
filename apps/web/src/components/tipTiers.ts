/**
 * Super Chat–style colour tiers: the bigger the tip, the louder the card.
 * Fixed colours (not theme tokens) so a tier reads the same in light and dark.
 */
const TIERS = [
  { min: 1000, head: "bg-[#a3262a] text-white", body: "bg-[#d63434] text-white" },
  { min: 250, head: "bg-[#b4480c] text-white", body: "bg-[#dc6118] text-white" },
  { min: 100, head: "bg-[#e6b000] text-[#1c2340]", body: "bg-[#ffd43b] text-[#1c2340]" },
  { min: 50, head: "bg-[#1d6b3b] text-white", body: "bg-[#2a8f50] text-white" },
  { min: 0, head: "bg-[#2f4880] text-white", body: "bg-[#3e5c9a] text-white" },
] as const;

export const tipTier = (amountKes: number) => TIERS.find((t) => amountKes >= t.min) ?? TIERS[TIERS.length - 1];

export const ksh = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;
