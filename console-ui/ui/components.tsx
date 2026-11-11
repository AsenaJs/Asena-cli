import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { type ComponentKind, KIND_STYLES } from './kinds';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(' ');

export const Pill = ({
  tone,
  dot = false,
  className,
  children,
}: {
  tone: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <span className={cx('pill', tone, className)}>
    {dot ? <span className="dot" aria-hidden="true" /> : null}
    {children}
  </span>
);

/** A toggle in a filter row; `color` adds the small type dot. */
export const Chip = ({
  pressed,
  color,
  onToggle,
  children,
}: {
  pressed: boolean;
  color?: string;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <button type="button" className="chip" aria-pressed={pressed} onClick={onToggle}>
    {color ? <i style={{ background: color }} aria-hidden="true" /> : null}
    {children}
  </button>
);

export const Glyph = ({ kind, large = false }: { kind: ComponentKind; large?: boolean }) => {
  const style = KIND_STYLES[kind];

  return (
    <span className={cx('glyph', large && 'large')} style={{ '--c': style.color } as CSSProperties} aria-hidden="true">
      {style.glyph}
    </span>
  );
};

export const methodClass = (method: string): string => `method m-${method.toLowerCase()}`;

export const MethodBadge = ({ method, className }: { method: string; className?: string }) => (
  <span className={cx(methodClass(method), className)}>{method}</span>
);

export const Card = ({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('card', className)} {...rest}>
    {children}
  </div>
);

export const IconButton = ({
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName }) => (
  <button type="button" className={cx('icon-btn', children === undefined && 'only-icon', className)} {...rest}>
    <Icon name={icon} />
    {children}
  </button>
);

export const SearchField = ({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => (
  <label className={cx('search', className)}>
    <Icon name="search" />
    <input
      type="search"
      placeholder={label}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: ReactNode;
}

/** ARIA tabs; each panel is expected at `${idPrefix}-panel-${id}`. */
export const Tabs = <T extends string>({
  label,
  idPrefix,
  tabs,
  selected,
  onSelect,
}: {
  label: string;
  idPrefix: string;
  tabs: TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
}) => {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    const index = tabs.findIndex((tab) => tab.id === selected);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length];

    if (!next) return;

    onSelect(next.id);
    document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`${idPrefix}-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={tab.id === selected}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === selected ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={onKeyDown}
        >
          {tab.label}
          {tab.badge === undefined ? null : <span className="badge">{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
};

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** A row of toggles, each independently pressed. */
export const SegmentedControl = <T extends string>({
  label,
  options,
  pressed,
  onToggle,
}: {
  label: string;
  options: SegmentOption<T>[];
  pressed: ReadonlySet<T>;
  onToggle: (id: T) => void;
}) => (
  <div className="seg" role="group" aria-label={label}>
    {options.map((option) => (
      <button key={option.id} type="button" aria-pressed={pressed.has(option.id)} onClick={() => onToggle(option.id)}>
        {option.label}
        {option.count === undefined ? null : <span className="n">{option.count}</span>}
      </button>
    ))}
  </div>
);

export const KeyValue = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="kv">
    {items.map(([key, value]) => (
      <div key={key} style={{ display: 'contents' }}>
        <dt>{key}</dt>
        <dd>{value}</dd>
      </div>
    ))}
  </dl>
);

export const List = ({ label, children }: { label?: string; children: ReactNode }) => (
  <ul className="list" aria-label={label}>
    {children}
  </ul>
);

export const SectionHead = ({ title, count }: { title: string; count?: number }) => (
  <div className="card-head">
    <h2 className="section-title">{title}</h2>
    {count === undefined ? null : <span className="muted num">{count}</span>}
  </div>
);

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="insp-block">
    <h4 className="eyebrow">{title}</h4>
    {children}
  </section>
);
