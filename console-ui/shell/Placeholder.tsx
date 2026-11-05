import { Card } from '../ui/components';
import { Icon } from '../ui/icons';
import { type ViewId, viewInfo } from './views';

/** A Debug view that is not built yet. */
export const Placeholder = ({ view }: { view: ViewId }) => {
  const info = viewInfo(view);

  return (
    <Card className="empty" aria-labelledby="placeholder-title">
      <span className="empty-icon">
        <Icon name={info.icon} />
      </span>
      <h2 id="placeholder-title">{info.label}</h2>
      <p>{info.summary}</p>
      <p className="muted">This panel is not built yet.</p>
    </Card>
  );
};

export const StaleNotice = ({ gen }: { gen: number | null }) => (
  <p className="notice" role="note">
    Showing what run {gen ?? '?'} reported. The current app process has not reported yet.
  </p>
);

export const WaitingForSnapshot = ({ view }: { view: ViewId }) => (
  <Card className="empty" aria-labelledby="waiting-title">
    <h2 id="waiting-title">{viewInfo(view).label}</h2>
    <p>Waiting for the app to report its components…</p>
  </Card>
);
