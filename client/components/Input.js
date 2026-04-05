export default function Input({
  label,
  className = '',
  type = 'text',
  onWheel,
  onKeyDown,
  ...props
}) {
  const isNumberInput = type === 'number';

  const handleWheel = (event) => {
    if (isNumberInput && document.activeElement === event.currentTarget) {
      // Blur to stop browser wheel from incrementing/decrementing number inputs.
      event.currentTarget.blur();
    }

    if (typeof onWheel === 'function') {
      onWheel(event);
    }
  };

  const handleKeyDown = (event) => {
    if (isNumberInput && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
    }

    if (typeof onKeyDown === 'function') {
      onKeyDown(event);
    }
  };

  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        type={type}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-red-600 focus:ring-2 focus:ring-red-100 ${className}`.trim()}
      />
    </label>
  );
}