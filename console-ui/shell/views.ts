export const VIEWS = [
  { id: 'graph', label: 'Graph' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'requests', label: 'Requests' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'config', label: 'Config' },
  { id: 'exceptions', label: 'Exceptions' },
] as const;

export type ViewId = (typeof VIEWS)[number]['id'];

export const viewHash = (view: ViewId): string => `#/${view}`;

/** The view a `#/<view>` hash names; any other hash (an in-page anchor) leaves `current` in place. */
export const viewFromHash = (hash: string, current: ViewId = 'graph'): ViewId =>
  VIEWS.find((view) => viewHash(view.id) === hash)?.id ?? current;
