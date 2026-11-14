import { useId, type ComponentType, type SVGProps } from 'react';

export interface Choice<V extends string> {
  value: V;
  label: string;
  hint?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
}

// A radio group drawn as big tappable cards with pictures. Native radios keep
// keyboard and screen-reader behaviour for free. Keep it to 5 options or fewer.
export function ChoiceCards<V extends string>({
  legend,
  optional,
  optionalLabel,
  options,
  value,
  onChange,
  columns = 2,
  error,
}: {
  legend: string;
  optional?: boolean;
  optionalLabel?: string;
  options: Choice<V>[];
  value: V | undefined;
  onChange: (v: V) => void;
  columns?: 1 | 2 | 3;
  error?: string;
}) {
  const name = useId();
  const cols = columns === 3 ? 'grid-cols-3' : columns === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold text-ink">
        {legend}
        {optional && <span className="ml-2 text-sm font-normal text-ink-subtle">({optionalLabel})</span>}
      </legend>
      <div className={`grid ${cols} gap-2`}>
        {options.map((o) => {
          const checked = value === o.value;
          const Icon = o.icon;
          return (
            <label
              key={o.value}
              className={`relative flex min-h-[64px] cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors motion-reduce:transition-none
                has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus
                ${checked ? 'border-brand-600 bg-brand-50' : 'border-surface-line bg-surface hover:border-brand-500'}
                ${columns === 3 ? 'flex-col justify-center text-center' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {Icon && <Icon size={columns === 3 ? 28 : 32} className={checked ? 'text-brand-700' : 'text-ink-muted'} />}
              <span className="flex flex-col">
                <span className="font-semibold leading-tight text-ink">{o.label}</span>
                {o.hint && <span className="mt-0.5 text-sm leading-snug text-ink-muted">{o.hint}</span>}
              </span>
              {checked && (
                <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-brand-600" aria-hidden="true" />
              )}
            </label>
          );
        })}
      </div>
      {error && <p className="text-sm font-medium text-danger-700">{error}</p>}
    </fieldset>
  );
}
