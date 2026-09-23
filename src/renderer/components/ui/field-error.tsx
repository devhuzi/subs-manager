interface FieldErrorProps {
  /** Referenced by the input's `aria-describedby`. */
  id: string;
  message?: string;
}

/** Inline validation message under a form field (destructive ink, for AA contrast). */
export const FieldError = ({ id, message }: FieldErrorProps): JSX.Element | null =>
  message ? (
    <p id={id} className="text-xs text-destructive-ink">
      {message}
    </p>
  ) : null;

/** Props wiring an input to its FieldError: `<Input {...fieldA11y('name', errors.name)} />`. */
export const fieldA11y = (
  id: string,
  error: { message?: string } | undefined,
): { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined } => ({
  id,
  'aria-invalid': Boolean(error),
  'aria-describedby': error ? `${id}-error` : undefined,
});
