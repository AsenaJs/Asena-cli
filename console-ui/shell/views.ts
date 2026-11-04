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

export const viewFromHash = (hash: string): ViewId => VIEWS.find((view) => viewHash(view.id) === hash)?.id ?? 'graph';
