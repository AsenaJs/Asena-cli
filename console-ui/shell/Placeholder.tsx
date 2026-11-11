import { Card } from '../ui/components';
import { type ViewId, viewInfo } from './views';

export const StaleNotice = ({ gen }: { gen: number | null }) => (
  <p className="notice" role="note">
    Showing what run {gen ?? '?'} reported. The current app process has not reported yet.
  </p>
);

export const StoppedNotice = () => (
  <p className="notice" role="note">
    This server has stopped. Showing what it reported; its schedules, events and transports take no commands.
  </p>
);

export const WaitingForSnapshot = ({ view }: { view: ViewId }) => (
  <Card className="empty" aria-labelledby="waiting-title">
    <h2 id="waiting-title">{viewInfo(view).label}</h2>
    <p>Waiting for the app to report its components…</p>
  </Card>
);
