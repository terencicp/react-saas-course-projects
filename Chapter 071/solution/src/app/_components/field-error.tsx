type FieldErrorProps = {
  name: string;
  fieldErrors: Record<string, string[]> | undefined;
};

export const FieldError = ({ name, fieldErrors }: FieldErrorProps) => {
  const message = fieldErrors?.[name]?.[0];
  if (!message) {
    return null;
  }

  return (
    <p
      id={`${name}-error`}
      className="mt-1 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
};
