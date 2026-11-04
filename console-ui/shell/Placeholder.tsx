export const Placeholder = ({ title }: { title: string }) => (
  <section className="panel panel-placeholder" aria-labelledby="placeholder-title">
    <h2 id="placeholder-title">{title}</h2>
    <p className="muted">This panel is not built yet.</p>
  </section>
);

export const WaitingForSnapshot = ({ title }: { title: string }) => (
  <section className="panel panel-placeholder" aria-labelledby="waiting-title">
    <h2 id="waiting-title">{title}</h2>
    <p className="muted">Waiting for the app to report its components…</p>
  </section>
);
