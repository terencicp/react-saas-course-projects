// TODO(L2) — render <p id={name-error} role=alert class=text-destructive> from fieldErrors?.[name]?.[0], else null.

type FieldErrorProps = {
  name: string;
  fieldErrors: Record<string, string[]> | undefined;
};

export const FieldError = (_props: FieldErrorProps) => {
  return null;
};
