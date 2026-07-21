import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

export default function PortfolioPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.listPortfolio(token);
      setItems(data.items || []);
    } catch (err) {
      showToast(err.message || 'Could not load portfolio');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = !q
    ? items
    : items.filter((item) =>
      `${item.title} ${item.client} ${item.clientAgentName || ''}`.toLowerCase().includes(q)
    );

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Live portfolio</h2>
          <p>
            {user?.role === 'agent'
              ? 'Live sites for your clients — share as portfolio work'
              : user?.role === 'manager'
                ? 'Live sites for your clients and your team’s clients'
                : 'All live production sites with client ownership'}
          </p>
        </div>
        <div className="heading-tools table-toolbar">
          <input
            className="search-input toolbar-control"
            type="search"
            placeholder="Search title or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <p className="commission-note">Loading portfolio…</p>
      ) : filtered.length === 0 ? (
        <div className="panel empty-panel">
          <p className="commission-note">
            {items.length === 0
              ? 'No live links yet. When production moves a card to Live with a link and CRM client, it shows here.'
              : 'No matches for this search.'}
          </p>
        </div>
      ) : (
        <div className="portfolio-grid">
          {filtered.map((item) => (
            <article key={item.id} className="portfolio-card panel">
              <div className="portfolio-card-top">
                <span className="tag tag-live">Live</span>
                <span className={`type-pill ${item.type}`}>{item.type === 'draft' ? 'Draft' : 'Revision'}</span>
              </div>
              <h3>{item.title}</h3>
              <p className="portfolio-client">
                <strong>{item.client}</strong>
                {item.clientAgentName ? (
                  <span> · Client of {item.clientAgentName}</span>
                ) : (
                  <span className="portfolio-warn"> · Agent not linked</span>
                )}
              </p>
              {item.assigneeName ? (
                <p className="portfolio-meta">Built by {item.assigneeName}</p>
              ) : null}
              <a
                className="tool-btn primary-btn portfolio-open"
                href={item.liveUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Icon id="i-link" /> Open live site
              </a>
              <p className="portfolio-url" title={item.liveUrl}>{item.liveUrl}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
