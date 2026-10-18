/*
 * Text recipes for form chrome. Most forms get these through <FormField> (form.tsx);
 * use them directly for a hand-built field or a fieldset legend.
 */

/** Bold field label, also used for fieldset legends. */
export const label = "p-0 text-sm font-medium text-ink";

/** Small grey helper text under a field. */
export const help = "text-sm font-normal text-ink-soft";

/** Small bold error text. */
export const errorText = "text-sm font-medium text-tag-red-deep";

/** A fieldset without the browser's border and padding. */
export const fieldset = "m-0 grid min-w-0 gap-2 border-0 p-0";
