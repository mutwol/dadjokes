import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { FieldValues, Path, Resolver, UseFormProps, UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import { isApiProblem, problemMessage } from "@/api/rtk/problem.ts";

/**
 * react-hook-form with a zod schema. Validates on blur first, then on every change once a
 * field has an error, so people aren't nagged while typing but see fixes land at once.
 *
 *   const form = useZodForm(schema, { defaultValues: { reason: "" } });
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  options: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, "resolver"> = {},
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: true,
    ...options,
    // zodResolver's overloads can't see through a generic schema; the types are the same.
    resolver: zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
  });
}

/**
 * Puts a failed request's errors onto the form: each 422 field message on its field
 * (paths like "body.reason" match the field "reason"), and anything else as a form-level
 * message under `root.server`, which <FormError> shows.
 */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T, unknown, unknown>, error: unknown) {
  const fields = Object.keys(form.getValues());
  let placed = false;
  if (isApiProblem(error)) {
    for (const [path, message] of Object.entries(error.fieldErrors)) {
      const name = fields.find((f) => path === f || path.endsWith(`.${f}`));
      if (name) {
        form.setError(name as Path<T>, { type: "server", message }, { shouldFocus: !placed });
        placed = true;
      }
    }
  }
  if (!placed) form.setError("root.server", { type: "server", message: problemMessage(error) });
}
