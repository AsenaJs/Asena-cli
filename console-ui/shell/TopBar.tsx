import { formatUptime } from '../runtime/format';
import type { ConsoleState } from '../state/store';
import { IconButton, Pill } from '../ui/components';
import { appStatus } from './status';
import { effectiveTheme, type ThemeChoice } from './theme';
import { type ViewId, viewInfo } from './views';

export interface TopBarProps {
  view: ViewId;
  state: ConsoleState;
  token: string | null;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  /** `null` when a restart cannot be asked for: no token or no connection. */
  onRestart: (() => void) | null;
}

export const TopBar = ({ view, state, token, theme, onTheme, onRestart }: TopBarProps) => {
  const info = viewInfo(view);
  const status = appStatus(state, token);
  const { child } = state;
  const uptime = child?.state === 'running' ? state.metrics.at(-1)?.uptimeSeconds : undefined;
  const next = effectiveTheme(theme) === 'dark' ? 'light' : 'dark';

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{info.label}</h1>
        <div className="sub">{info.summary}</div>
      </div>
      <div className="top-right">
        <div className="top-status" role="status" aria-live="polite" title={status.detail}>
          <Pill tone={status.tone} dot>
            {status.label}
            <span className="visually-hidden">: {status.detail}</span>
          </Pill>
          {child && child.gen > 0 ? (
            <Pill tone="neutral" className="num">
              Run {child.gen}
              {child.pid === undefined ? '' : ` · pid ${child.pid}`}
            </Pill>
          ) : null}
          {uptime === undefined ? null : (
            <Pill tone="neutral" className="num">
              up {formatUptime(uptime)}
            </Pill>
          )}
        </div>
        <IconButton
          icon="restart"
          title="Restart the app"
          disabled={!onRestart || child?.state === 'restarting'}
          onClick={() => onRestart?.()}
        >
          Restart
        </IconButton>
        <IconButton
          icon={next === 'dark' ? 'moon' : 'sun'}
          aria-label={`Switch to the ${next} theme`}
          onClick={() => onTheme(next)}
        >
          Theme
        </IconButton>
      </div>
    </header>
  );
};
