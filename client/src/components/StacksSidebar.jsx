import React from 'react';
import { Layers, Trash2, ChevronDown, X } from 'lucide-react';

const StacksSidebar = ({ stacks, onCreateStack, onDeleteStack, onAddToStack, onRemoveFromStack, bookmarks, selectedStack, onSelectStack }) => {
    const [expanded, setExpanded] = React.useState({});
    const [selectedBookmarkId, setSelectedBookmarkId] = React.useState(null);

    const toggleExpand = (id) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="fixed right-0 top-[73px] h-[calc(100vh-73px)] w-80 border-l border-zinc-800/50 bg-zinc-950/95 backdrop-blur-xl p-6 overflow-y-auto z-30">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Layers size={18} className="text-zinc-400" />
                    <h2 className="text-sm font-semibold text-zinc-100 tracking-wide">STACKS</h2>
                </div>
                <button
                    onClick={onCreateStack}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 3v12M3 9h12" />
                    </svg>
                </button>
            </div>

            {stacks.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-8">No stacks yet. Create one to organize your cosmos.</p>
            ) : (
                <div className="space-y-3">
                    {stacks.map(stack => (
                        <div
                            key={stack.id}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
                            }}
                            onDragLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '';
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.style.backgroundColor = '';
                                const bookmarkId = e.dataTransfer.getData('bookmarkId');
                                if (bookmarkId) {
                                    onAddToStack(stack.id, parseInt(bookmarkId));
                                }
                            }}
                            className="bg-zinc-900/40 rounded-lg border border-zinc-800/50 overflow-hidden transition-colors"
                        >
                            <div
                                className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${selectedStack === stack.id
                                    ? 'bg-purple-500/20 border-purple-500/50'
                                    : 'hover:bg-zinc-800/30'
                                    }`}
                                onClick={(e) => {
                                    // Toggle expansion with left click
                                    if (e.detail === 1) {
                                        toggleExpand(stack.id);
                                    }
                                }}
                                onDoubleClick={() => {
                                    // Filter graph with double click
                                    onSelectStack(stack.id);
                                }}
                                title="Double-click to view in graph"
                            >
                                <div className="flex items-center gap-2">
                                    <ChevronDown
                                        size={14}
                                        className={`text-zinc-500 transition-transform ${expanded[stack.id] ? 'rotate-0' : '-rotate-90'}`}
                                    />
                                    <span className={`text-sm font-medium ${selectedStack === stack.id ? 'text-purple-300' : 'text-zinc-200'
                                        }`}>
                                        {stack.name}
                                    </span>
                                    <span className="text-xs text-zinc-600">({stack.items?.length || 0})</span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteStack(stack.id);
                                    }}
                                    className="text-zinc-600 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            {expanded[stack.id] && (
                                <div className="px-3 pb-3 pt-1 space-y-1">
                                    {stack.items && stack.items.length > 0 ? (
                                        stack.items.map(item => (
                                            <div key={item.id} className="group flex items-center justify-between rounded transition-colors hover:bg-zinc-800/50 pr-2">
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block text-xs text-zinc-400 pl-6 py-1.5 truncate hover:text-zinc-200 flex-1"
                                                >
                                                    {item.title || item.url}
                                                </a>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRemoveFromStack(stack.id, item.id);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1"
                                                    title="Remove from stack"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-zinc-600 pl-6 py-2">Empty stack</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default StacksSidebar;
