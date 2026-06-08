import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * RelatedBookmarks — Displays semantically similar bookmarks for a given bookmark ID.
 *
 * Props:
 *   bookmarkId {number} — The ID of the bookmark to find related items for.
 */
const RelatedBookmarks = ({ bookmarkId }) => {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookmarkId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    axios
      .get(`http://localhost:3000/api/bookmarks/${bookmarkId}/related`)
      .then(r => setRelated(r.data || []))
      .catch(() => setRelated([]))
      .finally(() => setLoading(false));
  }, [bookmarkId]);

  /**
   * Extract the domain name from a URL for display purposes.
   */
  const getDomain = (url) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  /**
   * Determine the colour of the similarity score bar based on score value.
   */
  const getScoreColor = (score) => {
    if (score > 0.6) return 'bg-emerald-500';
    if (score >= 0.3) return 'bg-yellow-400';
    return 'bg-zinc-500';
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="w-4 h-4 rounded bg-zinc-700 flex-shrink-0 mt-1" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-zinc-700 rounded w-4/5" />
              <div className="h-2.5 bg-zinc-800 rounded w-2/5" />
              <div className="h-1 bg-zinc-800 rounded w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (related.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-zinc-500 text-xs">Computing relationships…</p>
        <p className="text-zinc-600 text-xs mt-1">
          Check back after a moment.
        </p>
      </div>
    );
  }

  // ── Related bookmark list ─────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {related.map((item) => {
        const domain = getDomain(item.url);
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
        const scorePercent = `${Math.round((item.score || 0) * 100)}%`;
        const scoreBarClass = getScoreColor(item.score || 0);

        return (
          <div
            key={item.id}
            className="group flex items-start gap-2.5 p-2 rounded-lg hover:bg-zinc-800/60 transition-colors"
          >
            {/* Favicon */}
            <img
              src={faviconUrl}
              alt=""
              className="w-4 h-4 rounded flex-shrink-0 mt-0.5 opacity-80"
              onError={e => { e.target.style.display = 'none'; }}
            />

            {/* Text content */}
            <div className="flex-1 min-w-0">
              <p
                className="text-zinc-200 text-xs font-medium truncate leading-tight"
                title={item.title}
              >
                {item.title || domain}
              </p>
              <p className="text-zinc-500 text-[11px] mt-0.5">{domain}</p>

              {/* Similarity score bar */}
              <div className="mt-1.5 h-0.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${scoreBarClass}`}
                  style={{ width: scorePercent }}
                />
              </div>
              <p className="text-zinc-600 text-[10px] mt-0.5">{scorePercent} match</p>
            </div>

            {/* Action buttons — visible on hover */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {/* Open in new tab */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                title="Open in new tab"
                onClick={e => e.stopPropagation()}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              {/* Graph / relationship icon */}
              <button
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                title="View in graph"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RelatedBookmarks;
