import React, { useState } from 'react';
import axios from 'axios';
import { X, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const ExportImportModal = ({ isOpen, onClose, onRefresh }) => {
    const [importing, setImporting] = useState(false);
    const [importStats, setImportStats] = useState(null);

    if (!isOpen) return null;

    const handleExport = () => {
        window.open('http://localhost:3000/api/export', '_blank');
        toast.success("Export started");
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                setImporting(true);

                const { data } = await axios.post('http://localhost:3000/api/import', jsonData);

                setImportStats(data);
                toast.success(`Import complete: ${data.addedBookmarks} added`);
                onRefresh();
            } catch (err) {
                console.error(err);
                toast.error("Import failed: " + (err.response?.data?.error || err.message));
            } finally {
                setImporting(false);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md shadow-2xl relative">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-light text-zinc-100">Data Management</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                        <X size={24} strokeWidth={1.5} />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Export Section */}
                    <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-all">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                                <Download size={20} />
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-zinc-200">Export Backup</h3>
                                <p className="text-xs text-zinc-500">Download your entire cosmos as JSON</p>
                            </div>
                        </div>
                        <button
                            onClick={handleExport}
                            className="w-full mt-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors"
                        >
                            Download JSON
                        </button>
                    </div>

                    {/* Import Section */}
                    <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-all">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                                <Upload size={20} />
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-zinc-200">Import Data</h3>
                                <p className="text-xs text-zinc-500">Restore from a backup JSON file</p>
                            </div>
                        </div>

                        {!importStats ? (
                            <div className="relative mt-3">
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={importing}
                                />
                                <button
                                    className={`w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors ${importing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {importing ? 'Importing...' : 'Select JSON File'}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <div className="flex items-center gap-2 text-green-400 mb-2">
                                    <CheckCircle size={14} />
                                    <span className="text-sm font-bold">Import Successful</span>
                                </div>
                                <ul className="text-xs text-green-300space-y-1">
                                    <li>Bookmarks Added: {importStats.addedBookmarks}</li>
                                    <li>Stacks Created: {importStats.addedStacks}</li>
                                </ul>
                                <button
                                    onClick={() => setImportStats(null)}
                                    className="mt-2 text-xs text-green-400 hover:text-green-300 underline"
                                >
                                    Import another file
                                </button>
                            </div>
                        )}

                        {importStats?.errors?.length > 0 && (
                            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <div className="flex items-center gap-2 text-red-400 mb-1">
                                    <AlertCircle size={14} />
                                    <span className="text-xs font-bold">Warnings</span>
                                </div>
                                <p className="text-xs text-red-300">{importStats.errors.length} items failed to import</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportImportModal;
