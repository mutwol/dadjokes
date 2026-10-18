import { createContext, useContext, useId } from "react";
import type { FormHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { FormProvider, get, useFormContext, useFormState } from "react-hook-form";
import type { FieldValues, Path, SubmitHandler, UseFormReturn } from "react-hook-form";
import { applyServerErrors } from "@/hooks/useZodForm.ts";
import { cn } from "@/lib/utils.ts";
import { button } from "./button.tsx";
import type { ButtonStyle } from "./button.tsx";
import { field } from "./input.tsx";
import type { FieldSize } from "./input.tsx";
import { errorText, help as helpClass, label as labelClass } from "./label.tsx";
import { Spinner } from "./spinner.tsx";

/**
 * Forms, the same way everywhere:
 *
 *   const form = useZodForm(schema, { defaultValues });
 *   const [save] = useUpdateMeMutation();
 *   <Form form={form} onSubmit={(v) => save({ updateMeRequest: v }).unwrap()}>
 *     <TextField name="name" label="Name" />
 *     <FormError />
 *     <SubmitButton>Save</SubmitButton>
 *   </Form>
 *
 * `onSubmit` may throw (or return a rejected `.unwrap()`): server field errors land on
 * their fields and anything else shows in <FormError>. Labels, help and error text are
 * wired to the input with ids and aria attributes, so screen readers get all three.
 */
export function Form<T extends FieldValues, O = T>({
  form,
  onSubmit,
  resetOnSuccess = false,
  className,
  children,
  ...props
}: {
  form: UseFormReturn<T, unknown, O>;
  onSubmit: (values: O) => unknown;
  /** Clear the fields after a successful submit (add-a-tag style forms). */
  resetOnSuccess?: boolean;
  children: ReactNode;
} & Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit">) {
  const submit: SubmitHandler<O> = async (values) => {
    form.clearErrors("root.server");
    try {
      await onSubmit(values);
      if (resetOnSuccess) form.reset();
    } catch (e) {
      applyServerErrors(form as unknown as UseFormReturn<FieldValues>, e);
    }
  };
  return (
    <FormProvider {...form}>
      <form noValidate className={cn("grid gap-4", className)} onSubmit={form.handleSubmit(submit)} {...props}>
        {children}
      </form>
    </FormProvider>
  );
}

/* ------------------------------------------------------------------ Field shell */

const FieldCtx = createContext<{ id: string; describedBy?: string; invalid: boolean } | null>(null);

/** The id, aria-describedby and aria-invalid for a custom control inside <FormField>. */
export function useFieldIds() {
  const ctx = useContext(FieldCtx);
  if (!ctx) throw new Error("useFieldIds must be used inside <FormField>");
  return { id: ctx.id, "aria-describedby": ctx.describedBy, "aria-invalid": ctx.invalid || undefined };
}


/**
 * Label + control + help + error for one field. The text fields below use it; wrap a
 * custom control in it and read `useFieldIds()` to wire the same ids.
 */
export function FormField<T extends FieldValues>({
  name,
  label,
  help,
  optional,
  hideLabel,
  className,
  children,
}: {
  name: Path<T>;
  label: ReactNode;
  help?: ReactNode;
  /** Shows "Optional" next to the label. Required is the default, so it isn't marked. */
  optional?: boolean;
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const { errors } = useFormState<T>({ name });
  const message = (get(errors, name) as { message?: string } | undefined)?.message;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldCtx.Provider value={{ id, describedBy, invalid: Boolean(message) }}>
      <div className={cn("grid content-start gap-1.5", className)}>
        <label htmlFor={id} className={cn(labelClass, "flex items-baseline gap-2", hideLabel && "sr-only")}>
          {label}
          {optional ? <span className="text-xs font-normal text-ink-faint">Optional</span> : null}
        </label>
        {children}
        {message ? (
          <p id={errorId} className={cn(errorText, "flex items-start gap-1.5")} role="alert">
            <svg viewBox="0 0 16 16" width="14" height="14" className="mt-0.75 shrink-0" aria-hidden="true">
              <path fill="currentColor" d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 9.75a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8ZM8 4a.8.8 0 0 0-.8.8v4a.8.8 0 0 0 1.6 0v-4A.8.8 0 0 0 8 4Z" />
            </svg>
            {message}
          </p>
        ) : help ? (
          <p id={helpId} className={helpClass}>
            {help}
          </p>
        ) : null}
      </div>
    </FieldCtx.Provider>
  );
}

type FieldProps<T extends FieldValues> = {
  name: Path<T>;
  label: ReactNode;
  help?: ReactNode;
  optional?: boolean;
  hideLabel?: boolean;
  fieldSize?: FieldSize;
  className?: string;
  /** Classes for the control itself (className goes on the field wrapper). */
  inputClassName?: string;
};

function Registered<T extends FieldValues>({
  as,
  name,
  fieldSize = "md",
  inputClassName,
  ...rest
}: { as: "input" | "textarea" | "select"; name: Path<T>; fieldSize?: FieldSize; inputClassName?: string } & Record<string, unknown>) {
  const { register } = useFormContext<T>();
  const ids = useFieldIds();
  const Tag = as;
  const valueAsNumber = as === "input" && rest.type === "number";
  return <Tag {...ids} className={field(fieldSize, cn(as === "textarea" && "min-h-24 resize-y", inputClassName))} {...register(name, { valueAsNumber })} {...rest} />;
}

export function TextField<T extends FieldValues>({
  name,
  label,
  help,
  optional,
  hideLabel,
  fieldSize,
  className,
  ...input
}: FieldProps<T> & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  return (
    <FormField<T> name={name} label={label} help={help} optional={optional} hideLabel={hideLabel} className={className}>
      <Registered<T> as="input" name={name} fieldSize={fieldSize} {...input} />
    </FormField>
  );
}

export function TextareaField<T extends FieldValues>({
  name,
  label,
  help,
  optional,
  hideLabel,
  className,
  ...input
}: FieldProps<T> & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  return (
    <FormField<T> name={name} label={label} help={help} optional={optional} hideLabel={hideLabel} className={className}>
      <Registered<T> as="textarea" name={name} {...input} />
    </FormField>
  );
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  help,
  optional,
  hideLabel,
  fieldSize,
  className,
  options,
  placeholder,
  ...input
}: FieldProps<T> & {
  options: readonly { value: string; label: string }[];
  placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  return (
    <FormField<T> name={name} label={label} help={help} optional={optional} hideLabel={hideLabel} className={className}>
      <Registered<T> as="select" name={name} fieldSize={fieldSize} {...input}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Registered>
    </FormField>
  );
}

/** A form-level error (anything that isn't about one field). Renders nothing when clear. */
export function FormError({ className }: { className?: string }) {
  const { errors } = useFormState();
  const message = (errors.root?.server as { message?: string } | undefined)?.message;
  if (!message) return null;
  return (
    <p role="alert" className={cn("rounded-md border border-tag-red/30 bg-tag-red/8 px-3 py-2 text-sm text-tag-red-deep", className)}>
      {message}
    </p>
  );
}

/**
 * Submit with a busy state. Disabled while submitting; with `requireDirty`, also until
 * something has changed (settings forms).
 */
export function SubmitButton({
  children,
  pendingLabel,
  requireDirty = false,
  disabled,
  variant,
  size,
  block,
  className,
}: { children: ReactNode; pendingLabel?: ReactNode; requireDirty?: boolean; disabled?: boolean } & ButtonStyle) {
  const { isSubmitting, isDirty } = useFormState();
  return (
    <button
      type="submit"
      className={button({ variant, size, block, className })}
      disabled={disabled || isSubmitting || (requireDirty && !isDirty)}
      aria-busy={isSubmitting || undefined}
    >
      {isSubmitting ? <Spinner /> : null}
      {isSubmitting && pendingLabel ? pendingLabel : children}
    </button>
  );
}
