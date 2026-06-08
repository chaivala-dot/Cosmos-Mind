import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

// Inject highlight <mark> styles once into the document head
const MARK_STYLE_ID = 'cosmos-mark-style';
if (typeof document !== 'undefined' && !document.getElementById(MARK_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = MARK_STYLE_ID;
    style.textContent = `
        mark {
            background-color: rgba(234, 179, 8, 0.3);
            color: #fde68a;
            border-radius: 2px;
            padding: 0 2px;
        }
    `;
    document.head.appendChild(style);
}

const API_BASE = 'http://localhost:3000';
const DEBOUNCE_MS = 200;

// ── Helpers ────────────────────────────────────────────────────────────────

const getDomain = (url) => {
    try { return new URL(url).hostname; } catch { return ''; }
};

const getFaviconUrl = (domain) =>
    `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;

// ── Sub-components ─────────────────────────────────────────────────────────

const Spinner = () => (
    <div className="flex justify-center items-center py-8">
        <div className="w-6 h-6 border-2 border-zinc-600 border-t-indigo-500 rounded-full animate-spin" />
    </div>
);

const SectionHeader = ({ children }) => (
    <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-500 bg-zinc-900/80 sticky top-0 z-10">
        {children}
    </div>
);

const BookmarkItem = ({ bookmark, isFocused, onKeyboardRef, onOpen }) => {
    const ref = useRef(null);

    useEffect(() => {
        if (isFocused && ref.current) {
            ref.current.scrollIntoView({ block: 'nearest' });
        }
        if (onKeyboardRef) onKeyboardRef(ref);
    }, [isFocused, onKeyboardRef]);

    const domain = bookmark.domain || getDomain(bookmark.url);

    return (
        <div
            ref={ref}
            className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isFocused ? 'bg-zinc-700/70' : 'hover:bg-zinc-800/60'
            }`}
            onClick={() => window.open(bookmark.url, '_blank', 'noopener,noreferrer')}
            role="option"
            aria-selected={isFocused}
        >
            {/* Favicon */}
            <div className="flex-shrink-0 mt-0.5 w-4 h-4">
                {domain ? (
                    <img
                        src={getFaviconUrl(domain)}
                        alt=""
                        width={16}
                        height={16}
                        className="rounded-sm"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                ) : (
                    <div className="w-4 h-4 rounded-sm bg-zinc-700" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div
                    className="text-sm font-medium text-zinc-100 truncate leading-snug"
                    dangerouslySetInnerHTML={{ __html: bookmark.title_snippet || bookmark.title || 'Untitled' }}
                />
                {bookmark.desc_snippet && (
                    <div
                        className="text-xs text-zinc-400 mt-0.5 line-clamp-1"
                        dangerouslySetInnerHTML={{ __html: bookmark.desc_snippet }}
                    />
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {domain && (
                        <span className="text-xs text-zinc-500 truncate max-w-[200px]">{domain}</span>
                    )}
                    {bookmark.tags?.slice(0, 3).map(tag => (
                        <span
                            key={tag}
                            className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>

            {/* Open button */}
            <button
                className="flex-shrink-0 text-zinc-500 hover:text-indigo-400 transition-colors text-sm px-1"
                onClick={(e) => {
                    e.stopPropagation();
                    window.open(bookmark.url, '_blank', 'noopener,noreferrer');
                }}
                tabIndex={-1}
                title="Open in new tab"
            >
                ↗
            </button>
        </div>
    );
};

const TagItem = ({ tag, isFocused, onKeyboardRef, onTagSelect }) => {
    const ref = useRef(null);

    useEffect(() => {
        if (isFocused && ref.current) {
            ref.current.scrollIntoView({ block: 'nearest' });
        }
        if (onKeyboardRef) onKeyboardRef(ref);
    }, [isFocused, onKeyboardRef]);

    return (
        <div
            ref={ref}
            className={`inline-flex items-center mx-1 my-1`}
        >
            <button
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    isFocused
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white'
                }`}
                onClick={() => onTagSelect && onTagSelect(tag)}
                role="option"
                aria-selected={isFocused}
            >
                # {tag}
            </button>
        </div>
    );
};

const StackItem = ({ stack, isFocused, onKeyboardRef }) => {
    const ref = useRef(null);

    useEffect(() => {
        if (isFocused && ref.current) {
            ref.current.scrollIntoView({ block: 'nearest' });
        }
        if (onKeyboardRef) onKeyboardRef(ref);
    }, [isFocused, onKeyboardRef]);

    return (
        <div
            ref={ref}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isFocused ? 'bg-zinc-700/70' : 'hover:bg-zinc-800/60'
            }`}
            role="option"
            aria-selected={isFocused}
        >
            <span className="text-zinc-400">📚</span>
            <span className="flex-1 text-sm text-zinc-200 font-medium">{stack.name}</span>
            <span className="text-xs text-zinc-500">{stack.count} item{stack.count !== 1 ? 's' : ''}</span>
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────

/**
 * SearchOverlay — Full-screen search modal triggered by Ctrl+K.
 *
 * Props:
 *   isOpen      {boolean}  - Whether the overlay is visible
 *   onClose     {function} - Called when the overlay should close
 *   onTagSelect {function} - Called with tag string when user selects a tag
 */
const SearchOverlay = ({ isOpen, onClose, onTagSelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ bookmarks: [], tags: [], stacks: [] });
    const [loading, setLoading] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);

    const inputRef = useRef(null);
    const debounceTimer = useRef(null);
    const itemRefs = useRef([]); // parallel array of refs for keyboard nav

    // ── Flatten items for keyboard navigation ──────────────────────────────
    const flatItems = [
        ...results.bookmarks.map(b => ({ type: 'bookmark', data: b })),
        ...results.tags.map(t => ({ type: 'tag', data: t })),
        ...results.stacks.map(s => ({ type: 'stack', data: s })),
    ];

    // Reset state when overlay opens
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults({ bookmarks: [], tags: [], stacks: [] });
            setFocusedIndex(-1);
            setLoading(false);
            // Auto-focus input on next frame
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);

    // Debounced search
    const doSearch = useCallback(async (q) => {
        if (!q || q.trim().length < 2) {
            setResults({ bookmarks: [], tags: [], stacks: [] });
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data } = await axios.get(`${API_BASE}/api/search`, {
                params: { q: q.trim() },
                timeout: 5000,
            });
            setResults(data || { bookmarks: [], tags: [], stacks: [] });
        } catch (err) {
            console.error('Search error:', err.message);
            setResults({ bookmarks: [], tags: [], stacks: [] });
        } finally {
            setLoading(false);
            setFocusedIndex(-1);
        }
    }, []);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setQuery(val);
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => doSearch(val), DEBOUNCE_MS);
    };

    // Cleanup debounce on unmount
    useEffect(() => () => clearTimeout(debounceTimer.current), []);

    // ── Keyboard navigation ────────────────────────────────────────────────
    const handleKeyDown = useCallback((e) => {
        if (!isOpen) return;

        if (e.key === 'Escape') {
            onClose();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev =>
                prev < flatItems.length - 1 ? prev + 1 : 0
            );
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev =>
                prev > 0 ? prev - 1 : flatItems.length - 1
            );
            return;
        }

        if (e.key === 'Enter' && focusedIndex >= 0) {
            e.preventDefault();
            const focused = flatItems[focusedIndex];
            if (!focused) return;

            if (focused.type === 'bookmark') {
                window.open(focused.data.url, '_blank', 'noopener,noreferrer');
                onClose();
            } else if (focused.type === 'tag') {
                if (onTagSelect) onTagSelect(focused.data);
                onClose();
            }
            // stacks: no default action currently
        }
    }, [isOpen, flatItems, focusedIndex, onClose, onTagSelect]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // ── Derived state ──────────────────────────────────────────────────────
    const hasResults =
        results.bookmarks.length > 0 ||
        results.tags.length > 0 ||
        results.stacks.length > 0;

    const showEmpty = !loading && query.trim().length >= 2 && !hasResults;

    // Index offset helpers for focusedIndex
    const bmStart = 0;
    const bmEnd = results.bookmarks.length;
    const tagStart = bmEnd;
    const tagEnd = tagStart + results.tags.length;
    const stackStart = tagEnd;

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex justify-center backdrop-blur-md bg-black/60"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
        >
            {/* Click-away backdrop */}
            <div
                className="absolute inset-0"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Search card */}
            <div
                className="relative w-full max-w-2xl mx-4 mt-[15vh] h-fit max-h-[70vh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Input row ── */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                    <svg
                        className="w-4 h-4 text-zinc-500 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                        />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={handleInputChange}
                        placeholder="Search your universe..."
                        className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 text-base outline-none"
                        autoComplete="off"
                        spellCheck="false"
                        role="combobox"
                        aria-expanded={hasResults}
                        aria-autocomplete="list"
                    />
                    {query && (
                        <button
                            className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
                            onClick={() => {
                                setQuery('');
                                setResults({ bookmarks: [], tags: [], stacks: [] });
                                inputRef.current?.focus();
                            }}
                            tabIndex={-1}
                        >
                            ✕
                        </button>
                    )}
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-800 border border-zinc-700 rounded">
                        ESC
                    </kbd>
                </div>

                {/* ── Results ── */}
                <div
                    className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-zinc-700"
                    role="listbox"
                    aria-label="Search results"
                >
                    {/* Loading */}
                    {loading && <Spinner />}

                    {/* Empty state */}
                    {showEmpty && (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                            <svg
                                className="w-10 h-10 mb-3 opacity-40"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <p className="text-sm">
                                No results for{' '}
                                <span className="text-zinc-300 font-medium">"{query}"</span>
                            </p>
                        </div>
                    )}

                    {/* Idle / welcome state */}
                    {!loading && !showEmpty && !hasResults && query.trim().length < 2 && (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-600 select-none">
                            <p className="text-sm">Type at least 2 characters to search</p>
                        </div>
                    )}

                    {/* Bookmarks section */}
                    {!loading && results.bookmarks.length > 0 && (
                        <div>
                            <SectionHeader>Bookmarks</SectionHeader>
                            {results.bookmarks.map((bookmark, i) => {
                                const flatIdx = bmStart + i;
                                return (
                                    <BookmarkItem
                                        key={bookmark.id}
                                        bookmark={bookmark}
                                        isFocused={focusedIndex === flatIdx}
                                        onOpen={() => {
                                            window.open(bookmark.url, '_blank', 'noopener,noreferrer');
                                            onClose();
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Tags section */}
                    {!loading && results.tags.length > 0 && (
                        <div>
                            <SectionHeader>Tags</SectionHeader>
                            <div className="flex flex-wrap px-3 py-2">
                                {results.tags.map((tag, i) => {
                                    const flatIdx = tagStart + i;
                                    return (
                                        <TagItem
                                            key={tag}
                                            tag={tag}
                                            isFocused={focusedIndex === flatIdx}
                                            onTagSelect={(t) => {
                                                if (onTagSelect) onTagSelect(t);
                                                onClose();
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Stacks section */}
                    {!loading && results.stacks.length > 0 && (
                        <div>
                            <SectionHeader>Stacks</SectionHeader>
                            {results.stacks.map((stack, i) => {
                                const flatIdx = stackStart + i;
                                return (
                                    <StackItem
                                        key={stack.id}
                                        stack={stack}
                                        isFocused={focusedIndex === flatIdx}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Bottom padding */}
                    {hasResults && <div className="h-2" />}
                </div>

                {/* ── Footer hint ── */}
                {hasResults && (
                    <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-800 text-xs text-zinc-600">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px]">↑↓</kbd>
                            navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px]">↵</kbd>
                            open
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px]">esc</kbd>
                            close
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchOverlay;
