/**
 * ChartPanel — skupni ovoj za vse grafikone (SCRUM-41).
 *
 * Stanja:
 *   - loading: spinner
 *   - error:   sporocilo + retry gumb
 *   - empty:   info, da ni podatkov
 *   - data:    renderira children (grafikon)
 */

export default function ChartPanel({ isLoading, error, isEmpty, emptyMessage, onRetry, title, subtitle, children }) {
  return (
    <article className="chart-panel">
      {(title || subtitle) && (
        <header className="chart-panel__header">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="chart-panel__subtitle">{subtitle}</p>}
          </div>
        </header>
      )}

      <div className="chart-panel__body">
        {isLoading && <ChartSkeleton />}
        {!isLoading && error && <ChartError onRetry={onRetry} />}
        {!isLoading && !error && isEmpty && <ChartEmpty message={emptyMessage} />}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </article>
  );
}

function ChartSkeleton() {
  return (
    <div className="chart-skeleton" role="status" aria-label="Nalagam podatke">
      <div className="chart-skeleton__spinner" />
      <span>Nalagam meritve…</span>
    </div>
  );
}

function ChartError({ onRetry }) {
  return (
    <div className="chart-message chart-message--error" role="alert">
      <p>Prišlo je do napake pri nalaganju meritev.</p>
      {onRetry && (
        <button type="button" className="primary-button" onClick={onRetry}>
          Poskusi znova
        </button>
      )}
    </div>
  );
}

function ChartEmpty({ message }) {
  return (
    <div className="chart-message chart-message--empty">
      <p>{message || 'Ni podatkov za prikaz.'}</p>
    </div>
  );
}
