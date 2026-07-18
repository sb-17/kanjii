import "./ClearableField.css";

// Wraps a text input/textarea and overlays a small ✕ button to wipe it in one
// tap. Show it only when the field is non-empty. `align` places the button:
// "center" for single-line inputs, "top" for textareas.
export default function ClearableField({
  show,
  onClear,
  align = "center",
  label = "Clear field",
  className = "",
  children,
}: {
  show: boolean;
  onClear: () => void;
  align?: "center" | "top";
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`clearable-field ${className}`.trim()}>
      {children}
      {show && (
        <button
          type="button"
          className={`clearable-clear clearable-clear-${align}`}
          onClick={onClear}
          aria-label={label}
          // Not a tab stop: keyboard users tab field-to-field, and can clear with
          // select-all + delete; the ✕ is a pointer affordance.
          tabIndex={-1}
        >
          ×
        </button>
      )}
    </div>
  );
}
