export function EmptyState({ message }: { message?: string }) {
  return (
    <main className="empty">
      <h1>No report data</h1>
      {message ? (
        <p>
          This dashboard could not read its embedded report: <strong>{message}</strong>
        </p>
      ) : (
        <p>This is the legacy-ratchet dashboard template. It doesn't contain a report yet.</p>
      )}
      <p>Generate a report from the root of your repository:</p>
      <pre>
        <code>legacy report --format html</code>
      </pre>
      <p className="muted">
        This writes <code>legacy-report.html</code>. Add <code>--append-history</code> to record a data point for the
        trend chart, and <code>--output &lt;file&gt;</code> to choose another file name.
      </p>
    </main>
  );
}
