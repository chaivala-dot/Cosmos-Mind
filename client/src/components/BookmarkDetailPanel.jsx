import React, { useEffect, useRef } from 'react';
import { X, ExternalLink, Edit2, Trash2, Plus } from 'lucide-react';
import RelatedBookmarks from './RelatedBookmarks';

/**
 * BookmarkDetailPanel — A right-side slide-in detail panel for a single bookmark.
 *
 * Props:
 *   bookmark  {object|null}  — The bookmark object to display. null = panel closed.
 *   onClose   {function}     — Called when the panel should close.
 *   stacks    {array}        — All stacks (to show membership).
 *   onEdit    {function}     — Called with the bookmark when "Edit" is clicked.
 *   onDelete  {function}     — Called with the bookmark id when "Delete" is clicked.
 */
const BookmarkDetailPanel = ({ bookmark, onClose, stacks = [], onEdit, onDelete }) => {
  const panelRef = useRef(null);

  // Close panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Trap focus inside the panel while open
  useEffect(() => {
    if (bookmark && panelRef.current) {
      panelRef.current.focus();
    }
  }, [bookmark]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getDomain = (url) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const getStacksContaining = (bookmarkId) =>
    stacks.filter(s => s.items && s.items.some(item => item.id === bookmarkId));

  // ── Rendered output ───────────────────────────────────────────────────────

  const isOpen = Boolean(bookmark);
  const domain = bookmark ? getDomain(bookmark.url) : '';
  const faviconUrl = bookmark
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
    : '';
  const memberStacks = bookmark ? getStacksContaining(bookmark.id) : [];
  const tags = bookmark ? (Array.isArray(bookmark.tags) ? bookmark.tags : []) : [];

  return (
    <>
      {/* ── Backdrop (closes panel on click, excludes the panel itself) ── */}
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Slide-in panel ─────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={bookmark ? `Details for ${bookmark.title}` : 'Bookmark details'}
        className={`fixed right-0 top-0 h-full w-96 bg-zinc-950 border-l border-zinc-800 z-40 shadow-2xl overflow-y-auto transform transition-transform duration-300 outline-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {bookmark && (
          <div className="flex flex-col h-full">

            {/* ── 1. Header ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800/70 flex-shrink-0">
              <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
                Detail
              </span>
              <div className="flex items-center gap-2">
                {/* External link */}
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink size={15} />
                </a>
                {/* Close */}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                  title="Close panel (Esc)"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* ── Scrollable body ───────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">

              {/* ── 2. Preview image ──────────────────────────────────── */}
              {bookmark.image && (
                <div className="aspect-video w-full overflow-hidden border-b border-zinc-800/50">
                  <img
                    src={bookmark.image}
                    alt={bookmark.title}
                    className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity duration-300"
                  />
                </div>
              )}

              <div className="px-5 pt-4 space-y-5">

                {/* ── 3. Domain ─────────────────────────────────────── */}
                <div className="flex items-center gap-2">
                  <img
                    src={faviconUrl}
                    alt=""
                    className="w-4 h-4 rounded flex-shrink-0"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium truncate">
                    {domain}
                  </span>
                </div>

                {/* ── 4. Title ──────────────────────────────────────── */}
                <h2 className="text-zinc-100 text-lg font-semibold leading-snug">
                  {bookmark.title || bookmark.url}
                </h2>

                {/* ── 5. Description ────────────────────────────────── */}
                {bookmark.description && (
                  <p className="text-zinc-400 text-sm leading-relaxed font-light">
                    {bookmark.description}
                  </p>
                )}

                {/* ── 6. Tags ───────────────────────────────────────── */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2">
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.length > 0 ? (
                      tags.map(tag => (
                        <span
                          key={tag}
                          className="px-2.5 py-1 bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 text-xs rounded-full hover:border-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                          #{tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-zinc-600 text-xs">No tags</span>
                    )}
                    {/* Visual "+" add tag button */}
                    <button
                      className="px-2 py-1 border border-dashed border-zinc-700/60 text-zinc-600 text-xs rounded-full hover:border-zinc-500 hover:text-zinc-400 transition-colors"
                      title="Add tag (edit bookmark to modify tags)"
                      onClick={() => onEdit && onEdit(bookmark)}
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>

                {/* ── 7. Stacks membership ──────────────────────────── */}
                {memberStacks.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2">
                      In Stacks
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {memberStacks.map(stack => (
                        <span
                          key={stack.id}
                          className="px-2.5 py-1 bg-indigo-900/30 border border-indigo-700/30 text-indigo-400 text-xs rounded-full"
                        >
                          {stack.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 8. Edit / Delete actions ──────────────────────── */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit && onEdit(bookmark)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-zinc-300 text-sm hover:bg-zinc-800 hover:border-zinc-600 hover:text-white transition-all"
                  >
                    <Edit2 size={13} />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (onDelete) {
                        onDelete(bookmark.id);
                        onClose();
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-900/20 border border-red-800/30 text-red-400 text-sm hover:bg-red-900/40 hover:border-red-700/50 hover:text-red-300 transition-all"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>

                {/* ── 9. Divider ────────────────────────────────────── */}
                <div className="border-t border-zinc-800/70" />

                {/* ── 10. Related bookmarks ─────────────────────────── */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-3">
                    Related
                  </p>
                  <RelatedBookmarks bookmarkId={bookmark.id} />
                </div>

                {/* ── 11. Bottom padding ────────────────────────────── */}
                <div className="h-8" />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default BookmarkDetailPanel;
