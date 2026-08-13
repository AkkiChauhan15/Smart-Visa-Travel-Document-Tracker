export default function SelectField({ id, label, error, children, ...selectProps }) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...selectProps}
      >
        {children}
      </select>
      {error && <span className="field-error" id={errorId}>{error}</span>}
    </div>
  );
}

