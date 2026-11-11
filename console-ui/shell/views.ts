import type { IconName } from '../ui/icons';

export interface ViewInfo {
  id: string;
  label: string;
  group: 'Inspect' | 'Debug';
  icon: IconName;
  /** The status bar's line under the title. */
  summary: string;
}

export const VIEWS = [
  {
    id: 'graph',
    label: 'Components',
    group: 'Inspect',
    icon: 'graph',
    summary: 'How the app is wired: who injects whom, which middleware guards which route.',
  },
  {
    id: 'runtime',
    label: 'Runtime',
    group: 'Inspect',
    icon: 'runtime',
    summary: 'Is it up, what does it cost, and what is it saying.',
  },
  {
    id: 'endpoints',
    label: 'Endpoints',
    group: 'Inspect',
    icon: 'endpoints',
    summary: 'Call any route or socket of the running app with the request prefilled from its definition.',
  },
  {
    id: 'requests',
    label: 'Requests',
    group: 'Debug',
    icon: 'requests',
    summary: 'Every request this session served, with the chain that answered it.',
  },
  {
    id: 'messaging',
    label: 'Messaging',
    group: 'Debug',
    icon: 'messaging',
    summary: 'Schedules, events and message handlers, with run, emit and send.',
  },
  {
    id: 'config',
    label: 'Config',
    group: 'Debug',
    icon: 'config',
    summary: 'Every @Value field, the effective config and the server options.',
  },
  {
    id: 'exceptions',
    label: 'Exceptions',
    group: 'Debug',
    icon: 'exceptions',
    summary: 'Which error type goes to which @Catch, and who catches a given error.',
  },
] as const satisfies readonly ViewInfo[];

export type ViewId = (typeof VIEWS)[number]['id'];

export const viewInfo = (view: ViewId): ViewInfo => VIEWS.find((entry) => entry.id === view) ?? VIEWS[0];

export const viewHash = (view: ViewId): string => `#/${view}`;

/** The view a `#/<view>` hash names; any other hash (an in-page anchor) leaves `current` in place. */
export const viewFromHash = (hash: string, current: ViewId = 'graph'): ViewId =>
  VIEWS.find((view) => viewHash(view.id) === hash)?.id ?? current;
