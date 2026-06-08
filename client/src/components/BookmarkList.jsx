import React, { useState } from 'react';
import { Search, Tag, ExternalLink, Trash2, Edit2 } from 'lucide-react';

const BookmarkList = ({ bookmarks, onDelete, onEdit, stacks, onAddToStack, selectedIds, onToggleSelection }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showStackMenu, setShowStackMenu] = useState(null); // { bookmarkId: X, x: Y, y: Z }

    const filteredBookmarks = bookmarks.filter(b =>
        b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="w-full">
            <div className="relative mb-12 max-w-2xl mx-auto group">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-zinc-500 group-focus-within:text-zinc-200 transition-colors" size={18} />
                <input
                    type="text"
                    placeholder="Search your universe..."
                    className="w-full pl-12 pr-4 py-3 bg-zinc-900/40 border border-zinc-800/60 rounded-full text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 transition-all placeholder:text-zinc-600 backdrop-blur-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
                {filteredBookmarks.map(bookmark => {
                    const isSelected = selectedIds?.has(bookmark.id);

                    return (
                        <div
                            key={bookmark.id}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('bookmarkId', bookmark.id.toString());
                                e.currentTarget.style.opacity = '0.5';
                            }}
                            onDragEnd={(e) => {
                                e.currentTarget.style.opacity = '1';
                            }}
                            className={`break-inside-avoid group relative bg-zinc-900/30 p-6 rounded-xl border transition-all duration-300 cursor-grab active:cursor-grabbing
                                ${isSelected
                                    ? 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_20px_rgba(168,85,247,0.1)]'
                                    : 'border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-900/60 hover:shadow-2xl'
                                }
                            `}
                        >
                            {/* Selection Checkbox */}
                            <div className={`absolute top-4 left-4 z-20 transition-all duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleSelection(bookmark.id);
                                    }}
                                    className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors
                                        ${isSelected
                                            ? 'bg-purple-500 border-purple-500 text-black'
                                            : 'bg-zinc-900/80 border-zinc-600 hover:border-zinc-400'
                                        }
                                    `}
                                >
                                    {isSelected && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline><path d="M1 7l3.5 3.5L11 3" /></svg>}
                                </div>
                            </div>

                            {/* Hover Actions */}
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-2 z-20">
                                <a
                                    href={bookmark.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-700 transition-colors"
                                >
                                    <ExternalLink size={14} />
                                </a>
                                <button
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setShowStackMenu({
                                            bookmarkId: bookmark.id,
                                            x: rect.right,
                                            y: rect.bottom
                                        });
                                    }}
                                    className="p-2 bg-zinc-800 text-zinc-400 hover:text-purple-400 rounded-full hover:bg-zinc-700 transition-colors"
                                    title="Add to Stack"
                                >
                                    <Tag size={14} />
                                </button>
                                <button
                                    onClick={() => onEdit(bookmark)}
                                    className="p-2 bg-zinc-800 text-zinc-400 hover:text-blue-400 rounded-full hover:bg-zinc-700 transition-colors"
                                >
                                    <Edit2 size={14} />
                                </button>
                                <button
                                    onClick={() => onDelete(bookmark.id)}
                                    className="p-2 bg-zinc-800 text-zinc-400 hover:text-red-400 rounded-full hover:bg-zinc-700 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <div className="mb-4">
                                {bookmark.image && (
                                    <div className="mb-4 rounded-lg overflow-hidden border border-zinc-800/50 aspect-video group-hover:border-zinc-600/50 transition-colors">
                                        <img
                                            src={bookmark.image}
                                            alt={bookmark.title}
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                                        />
                                    </div>
                                )}
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2 block">
                                    {new URL(bookmark.url).hostname.replace('www.', '')}
                                </span>
                                <h3 className="text-lg font-medium text-zinc-100 leading-snug group-hover:text-white transition-colors">
                                    {bookmark.title || bookmark.url}
                                </h3>
                            </div>

                            {bookmark.description && (
                                <p className="text-zinc-400 text-sm mb-6 leading-relaxed font-light line-clamp-3">
                                    {bookmark.description}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-2 mt-auto">
                                {(() => {
                                    // Deduplicate tags case-insensitively, preferring the first occurrence's casing
                                    const uniqueTags = bookmark.tags.reduce((acc, tag) => {
                                        if (!acc.some(t => t.toLowerCase() === tag.toLowerCase())) {
                                            acc.push(tag);
                                        }
                                        return acc;
                                    }, []);

                                    const DISPLAY_LIMIT = 3;
                                    const visibleTags = uniqueTags.slice(0, DISPLAY_LIMIT);
                                    const remainingCount = uniqueTags.length - DISPLAY_LIMIT;

                                    return (
                                        <>
                                            {visibleTags.map(tag => (
                                                <span key={tag} className="px-3 py-1 bg-zinc-800/50 border border-zinc-700/30 text-zinc-400 text-xs rounded-full group-hover:border-zinc-600 group-hover:text-zinc-300 transition-all">
                                                    #{tag}
                                                </span>
                                            ))}
                                            {remainingCount > 0 && (
                                                <span className="px-2 py-1 text-zinc-500 text-[10px] self-center">
                                                    +{remainingCount}
                                                </span>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredBookmarks.length === 0 && (
                <div className="text-center text-zinc-600 py-20">
                    <p className="text-sm font-light tracking-wide">Nothing found in this sector.</p>
                </div>
            )}

            {/* Stack Selection Context Menu */}
            {showStackMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowStackMenu(null)}
                    />
                    <div
                        className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-2 min-w-[200px]"
                        style={{
                            left: `${showStackMenu.x}px`,
                            top: `${showStackMenu.y}px`,
                            transform: 'translate(-100%, 0)'
                        }}
                    >
                        <div className="px-3 py-2 text-xs text-zinc-500 font-semibold uppercase tracking-wider border-b border-zinc-800">
                            Add to Stack
                        </div>
                        {stacks && stacks.length > 0 ? (
                            stacks.map(stack => (
                                <button
                                    key={stack.id}
                                    onClick={() => {
                                        onAddToStack(stack.id, showStackMenu.bookmarkId);
                                        setShowStackMenu(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                                >
                                    {stack.name}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-xs text-zinc-600">
                                No stacks yet. Create one first!
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default BookmarkList;
