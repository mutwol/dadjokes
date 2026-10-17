import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn.ts";
import { button, iconButton, textButton } from "./recipes.ts";
import type { ButtonStyle } from "./recipes.ts";

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonStyle & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={button({ variant, size, block, className })} {...props} />;
}

/** A round, 44px icon-only button. Always give it an `aria-label`. */
export function IconButton({
  tone = "ink",
  className,
  type = "button",
  ...props
}: { tone?: "ink" | "white" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={iconButton(tone, className)} {...props} />;
}

export function TextButton({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn(textButton, className)} {...props} />;
}
