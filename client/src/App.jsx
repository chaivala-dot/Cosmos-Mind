import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LayoutGrid, Network, Plus, X, Database } from 'lucide-react';
import BookmarkList from './components/BookmarkList';
import NetworkGraph from './components/NetworkGraph';
import StacksSidebar from './components/StacksSidebar';

import { Toaster, toast } from 'sonner';
import SettingsModal from './components/SettingsModal';
import ExportImportModal from './components/ExportImportModal';
import StatsDashboard from './components/StatsDashboard';

function App() {
    const [bookmarks, setBookmarks] = useState([]);
    const [view, setView] = useState('list');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newUrl, setNewUrl] = useState('');
    const [newTags, setNewTags] = useState('');
    const [loading, setLoading] = useState(false);

    const [editingBookmark, setEditingBookmark] = useState(null);
    const [stacks, setStacks] = useState([]);
    const [showStackModal, setShowStackModal] = useState(false);
    const [newStackName, setNewStackName] = useState('');
    const [showStacks, setShowStacks] = useState(false);
    const [selectedStack, setSelectedStack] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showDataModal, setShowDataModal] = useState(false);

    useEffect(() => {
        fetchBookmarks();
        fetchStacks();

        const handleKeyDown = (e) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setShowAddModal(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const fetchBookmarks = async () => {
        try {
            const { data } = await axios.get('http://localhost:3000/api/bookmarks');
            setBookmarks(data);
        } catch (err) {
            toast.error("Failed to sync with universe");
        }
    };

    const fetchStacks = async () => {
        try {
            const { data } = await axios.get('http://localhost:3000/api/stacks');
            setStacks(data);
        } catch (err) {
            toast.error("Failed to load stacks");
        }
    };

    const handleEdit = (bookmark) => {
        setEditingBookmark(bookmark);
        setNewUrl(bookmark.url);
        setNewTags(bookmark.tags.join(', '));
        setShowAddModal(true);
    };

    const handleCloseModal = () => {
        setShowAddModal(false);
        setEditingBookmark(null);
        setNewUrl('');
        setNewTags('');
    };

    const addOrUpdateBookmark = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const tagsArray = newTags.split(',').map(t => t.trim()).filter(Boolean);

            if (editingBookmark) {
                // Update
                await axios.put(`http://localhost:3000/api/bookmarks/${editingBookmark.id}`, {
                    ...editingBookmark,
                    url: newUrl,
                    tags: tagsArray
                });
                toast.success("Element evolved successfully");
            } else {
                // Create
                await axios.post('http://localhost:3000/api/bookmarks', {
                    url: newUrl,
                    tags: tagsArray
                });
                toast.success("Element captured successfully");
            }

            handleCloseModal();
            fetchBookmarks();
        } catch (err) {
            toast.error(editingBookmark ? "Failed to evolve element" : "Failed to capture element");
        } finally {
            setLoading(false);
        }
    };

    const deleteBookmark = async (id) => {
        try {
            await axios.delete(`http://localhost:3000/api/bookmarks/${id}`);
            fetchBookmarks();
            // Show toast with Undo action
            toast.success("Bookmark deleted", {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await axios.post(`http://localhost:3000/api/bookmarks/${id}/restore`);
                            dismiss();
                            fetchBookmarks();
                            toast.success("Restored");
                        } catch (err) {
                            toast.error("Failed to restore");
                        }
                    }
                },
                duration: 4000,
            });
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete bookmark");
        }
    };

    const handleTagAssignment = async (bookmarkId, newTag) => {
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;

        if (bookmark.tags.some(t => t.toLowerCase() === newTag.toLowerCase())) {
            toast.error(`Already tagged with #${newTag}`);
            return;
        }

        const updatedTags = [...bookmark.tags, newTag];
        try {
            await axios.patch(`http://localhost:3000/api/bookmarks/${bookmarkId}/tags`, {
                tags: updatedTags
            });
            fetchBookmarks();
            toast.success(`Tagged with #${newTag}`);
        } catch (err) {
            toast.error("Failed to update tags");
        }
    };

    const createStack = async () => {
        if (!newStackName.trim()) return;
        try {
            await axios.post('http://localhost:3000/api/stacks', { name: newStackName });
            setNewStackName('');
            setShowStackModal(false);
            fetchStacks();
            toast.success(`Stack "${newStackName}" created`);
        } catch (err) {
            toast.error("Failed to create stack");
        }
    };

    const deleteStack = async (id) => {
        try {
            await axios.delete(`http://localhost:3000/api/stacks/${id}`);
            fetchStacks();
            toast.success("Stack deleted");
        } catch (err) {
            toast.error("Failed to delete stack");
        }
    };

    const addBookmarkToStack = async (stackId, bookmarkId) => {
        try {
            await axios.post(`http://localhost:3000/api/stacks/${stackId}/items`, { bookmarkId });
            fetchStacks();
            toast.success("Added to stack");
        } catch (err) {
            toast.error("Failed to add to stack");
        }
    };

    const removeBookmarkFromStack = async (stackId, bookmarkId) => {
        try {
            await axios.delete(`http://localhost:3000/api/stacks/${stackId}/items/${bookmarkId}`);
            fetchStacks();
            toast.success("Removed from stack");
        } catch (err) {
            toast.error("Failed to remove from stack");
        }
    };

    // --- BULK OPERATIONS ---
    const [selectedIds, setSelectedIds] = useState(new Set());

    const toggleSelection = (id) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.size} bookmarks?`)) return;

        try {
            await axios.post('http://localhost:3000/api/bookmarks/bulk/delete', {
                ids: Array.from(selectedIds)
            });
            clearSelection();
            fetchBookmarks();
            toast.success("Items deleted", {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await axios.post('http://localhost:3000/api/bookmarks/bulk/restore', {
                                ids: Array.from(selectedIds) // This might be empty if we cleared it? No, we need closure capture or passing it. 
                                // Actually, handleBulkDelete closes over selectedIds via Array.from(selectedIds) in the *first* call, 
                                // but for the Undo/restore we need the IDs that WERE deleted.
                                // Let's simplify and just rely on the IDs being captured in this scope.
                                // Wait, `selectedIds` is a const in this render. `Array.from(selectedIds)` creates a new array.
                                // So we need to store `idsToRestore` locally.
                            });
                            // However, react state closure might be stale if we don't capture it right. 
                            // But here we are inside the function scope, so `ids` (the array) will be captured.
                        } catch (err) { toast.error("Restore failed"); }
                    }
                }
            });

            // We need to capture the IDs for the undo action properly
            const idsToDelete = Array.from(selectedIds);
            // Updating the toast action to use idsToDelete
            toast.success(`${idsToDelete.length} items deleted`, {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await axios.post('http://localhost:3000/api/bookmarks/bulk/restore', { ids: idsToDelete });
                            fetchBookmarks();
                            toast.success("Restored");
                        } catch (e) { toast.error("Failed to restore"); }
                    }
                }
            });

        } catch (err) {
            toast.error("Failed to delete items");
        }
    };

    const handleBulkAddToStack = async (stackId) => {
        try {
            await axios.post(`http://localhost:3000/api/stacks/${stackId}/bulk-add`, {
                ids: Array.from(selectedIds)
            });
            clearSelection();
            toast.success("Added to stack");
        } catch (err) {
            toast.error("Failed to add to stack");
        }
    };


    return (
        <div className="min-h-screen text-zinc-200 selection:bg-zinc-700/50 pb-20"> {/* pb-20 for floating bar */}
            <Toaster position="bottom-right" theme="dark" />

            {/* Header - Minimalist */}
            <header className="sticky top-0 z-50 px-8 py-5 flex justify-between items-center bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900/50">
                {/* ... existing header ... */}
                <div className="flex items-center gap-3">
                    <div className="bg-zinc-100 rounded-full p-1.5 shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                        <div className="w-3 h-3 bg-black rounded-full" />
                    </div>
                    <h1 className="text-lg font-medium tracking-tight text-zinc-100">
                        Cosmos Mind
                    </h1>
                </div>

                <div className="flex items-center gap-6">
                    {/* ... existing header buttons ... */}
                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                        <button
                            onClick={() => setView('list')}
                            className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'list'
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Index
                        </button>
                        <button
                            onClick={() => setView('graph')}
                            className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'graph'
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Graph
                        </button>
                        <button
                            onClick={() => setView('stats')}
                            className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'stats'
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Stats
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            setEditingBookmark(null);
                            setNewUrl('');
                            setNewTags('');
                            setShowAddModal(true);
                        }}
                        className="bg-zinc-100 hover:bg-zinc-200 text-black px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                    >
                        <Plus size={16} className="inline mr-1" strokeWidth={3} />
                        Save
                    </button>

                    <button
                        onClick={() => setShowStacks(!showStacks)}
                        className={`p-2 rounded-full transition-all ${showStacks
                            ? 'bg-zinc-100 text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                            : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 border border-zinc-800/50'
                            }`}
                        title="Toggle Stacks"
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7h18M3 12h18M3 17h18" />
                        </svg>
                    </button>

                    <button
                        onClick={() => setShowDataModal(true)}
                        className="p-2 rounded-full transition-all bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 border border-zinc-800/50 hover:border-zinc-700"
                        title="Data & Backup"
                    >
                        <Database size={18} strokeWidth={2} />
                    </button>

                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-full transition-all bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 border border-zinc-800/50 hover:border-zinc-700"
                        title="Settings"
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="9" cy="9" r="3" />
                            <path d="M9 1v2M9 15v2M3.93 3.93l1.41 1.41M12.66 12.66l1.41 1.41M1 9h2M15 9h2M3.93 14.07l1.41-1.41M12.66 5.34l1.41-1.41" />
                        </svg>
                    </button>
                </div>
            </header>

            <div className="flex">
                {/* Main Content */}
                <div className="flex-1 max-w-[1600px] mx-auto p-8">
                    <main className="animate-fade-in">
                        {(() => {
                            // Filter bookmarks if a stack is selected
                            const displayBookmarks = selectedStack
                                ? stacks.find(s => s.id === selectedStack)?.items || []
                                : bookmarks;

                            if (view === 'list') {
                                return (
                                    <BookmarkList
                                        bookmarks={displayBookmarks}
                                        onDelete={deleteBookmark}
                                        onEdit={handleEdit}
                                        stacks={stacks}
                                        onAddToStack={addBookmarkToStack}
                                        selectedIds={selectedIds}
                                        onToggleSelection={toggleSelection}
                                    />
                                );
                            } else if (view === 'graph') {
                                // ... existing graph code ...
                                return (
                                    <>
                                        {selectedStack && (
                                            <div className="mb-6 flex items-center gap-3">
                                                <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-full">
                                                    <span className="text-sm text-purple-300">
                                                        Viewing: <strong>{stacks.find(s => s.id === selectedStack)?.name}</strong>
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedStack(null)}
                                                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                                >
                                                    Clear filter
                                                </button>
                                            </div>
                                        )}
                                        <NetworkGraph
                                            bookmarks={displayBookmarks}
                                            onNodeClick={(id) => console.log(id)}
                                            onTagAssignment={handleTagAssignment}
                                        />
                                    </>
                                );
                            } else if (view === 'stats') {
                                return <StatsDashboard bookmarks={bookmarks} stacks={stacks} />;
                            }
                        })()}
                    </main>
                </div>

                {/* Stacks Sidebar - Conditionally rendered */}
                {showStacks && (
                    <StacksSidebar
                        stacks={stacks}
                        bookmarks={bookmarks}
                        selectedStack={selectedStack}
                        onSelectStack={handleSelectStack}
                        onCreateStack={() => setShowStackModal(true)}
                        onDeleteStack={deleteStack}
                        onAddToStack={addBookmarkToStack}
                        onRemoveFromStack={removeBookmarkFromStack}
                    />
                )}
            </div>

            {/* Bulk Action Floating Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 z-50 animate-in fade-in slide-in-from-bottom-4 transition-all">
                    <div className="flex items-center gap-2 border-r border-zinc-700 pr-4">
                        <span className="bg-zinc-100 text-zinc-900 text-xs font-bold px-2 py-0.5 rounded-full">
                            {selectedIds.size}
                        </span>
                        <span className="text-sm text-zinc-300">Selected</span>
                    </div>

                    <button
                        onClick={() => {
                            // Quick hack: use the Stack Modal to "create" a stack, but we want to "add to existing".
                            // For now, let's just toggle the sidebar so they can drag? No, bulk drag is hard.
                            // Let's rely on the assumption user has stacks.
                            // We will implement a simple prompt or just rely on the user knowing to use the sidebar for now?
                            // Actually, we can make the "Add to Stack" button show a small popover of stacks right here.
                            // But for simplicity in this step, let's just show a toast saying "Drag items to sidebar" if we supported that, but we don't yet for bulk.
                            // Let's implement a simple stack picker modal or prompt.
                            const stackName = prompt("Enter stack name to add to (case sensitive for now):");
                            if (stackName) {
                                const stack = stacks.find(s => s.name === stackName);
                                if (stack) handleBulkAddToStack(stack.id);
                                else toast.error("Stack not found");
                            }
                        }}
                        className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1"
                        title="Add to Stack"
                    >
                        <span className="text-sm font-medium">Add to Stack</span>
                    </button>

                    <div className="h-4 w-[1px] bg-zinc-800"></div>

                    <button
                        onClick={handleBulkDelete}
                        className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                    >
                        <Trash2 size={16} />
                        <span className="text-sm font-medium">Delete</span>
                    </button>

                    <div className="h-4 w-[1px] bg-zinc-800"></div>

                    <button
                        onClick={clearSelection}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-2xl shadow-2xl relative">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-light text-zinc-100">
                                {editingBookmark ? 'Edit Element' : 'Capture Element'}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="text-zinc-500 hover:text-zinc-200 transition-colors"
                            >
                                <X size={24} strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <input
                                type="text"
                                placeholder="https://..."
                                value={newUrl}
                                onChange={(e) => setNewUrl(e.target.value)}
                                className="w-full bg-zinc-950/50 border-b-2 border-zinc-800 focus:border-zinc-100 text-zinc-100 p-4 outline-none transition-all placeholder:text-zinc-700 text-lg font-light rounded-t-lg"
                                autoFocus
                            />

                            <input
                                type="text"
                                placeholder="Tags (comma separated)..."
                                value={newTags}
                                onChange={(e) => setNewTags(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddBookmark()}
                                className="w-full bg-zinc-950/50 border-b-2 border-zinc-800 focus:border-zinc-100 text-zinc-100 p-4 outline-none transition-all placeholder:text-zinc-700 font-light"
                            />

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleAddBookmark}
                                    disabled={loading}
                                    className="px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-900 rounded-xl font-bold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'PROCESSING...' : (editingBookmark ? 'SAVE CHANGES' : 'CAPTURE')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stack Creation Modal */}
            {showStackModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md shadow-2xl relative">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-light text-zinc-100">Create Stack</h2>
                            <button onClick={() => setShowStackModal(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                                <X size={24} strokeWidth={1.5} />
                            </button>
                        </div>

                        <input
                            type="text"
                            placeholder="Stack name..."
                            value={newStackName}
                            onChange={(e) => setNewStackName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createStack()}
                            className="w-full bg-zinc-950/50 border-b-2 border-zinc-800 focus:border-zinc-100 text-zinc-100 p-3 outline-none transition-all placeholder:text-zinc-700 text-lg font-light rounded-t-lg mb-4"
                            autoFocus
                        />

                        <button
                            onClick={createStack}
                            className="w-full bg-zinc-100 hover:bg-white text-zinc-900 py-3 rounded-xl font-bold tracking-wide transition-all"
                        >
                            CREATE STACK
                        </button>
                    </div>
                </div>
            )}

            {/* Bulk Action Floating Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 z-50 animate-in fade-in slide-in-from-bottom-4 transition-all">
                    <div className="flex items-center gap-2 border-r border-zinc-700 pr-4">
                        <span className="bg-zinc-100 text-zinc-900 text-xs font-bold px-2 py-0.5 rounded-full">
                            {selectedIds.size}
                        </span>
                        <span className="text-sm text-zinc-300">Selected</span>
                    </div>

                    <button
                        onClick={() => {
                            const stackName = prompt("Enter stack name to add to (case sensitive for now):");
                            if (stackName) {
                                const stack = stacks.find(s => s.name === stackName);
                                if (stack) handleBulkAddToStack(stack.id);
                                else toast.error("Stack not found");
                            }
                        }}
                        className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1"
                        title="Add to Stack"
                    >
                        <span className="text-sm font-medium">Add to Stack</span>
                    </button>

                    <div className="h-4 w-[1px] bg-zinc-800"></div>

                    <button
                        onClick={handleBulkDelete}
                        className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                    >
                        <Trash2 size={16} />
                        <span className="text-sm font-medium">Delete</span>
                    </button>

                    <div className="h-4 w-[1px] bg-zinc-800"></div>

                    <button
                        onClick={clearSelection}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Settings Modal */}
            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

            {/* Export/Import Modal */}
            <ExportImportModal
                isOpen={showDataModal}
                onClose={() => setShowDataModal(false)}
                onRefresh={() => {
                    fetchBookmarks();
                    fetchStacks();
                }}
            />
        </div>
    );
}

export default App;
