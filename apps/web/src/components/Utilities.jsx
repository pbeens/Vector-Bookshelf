import { useState, useEffect } from 'react';
import { playSuccessSound } from '../utils/sound';

const ALL_UTILITIES = [
    { id: 'add-books', name: 'Add / Scan Books', description: 'Import new ebooks from your local directories.' },
    { id: 'ai-manager', name: 'AI Model Manager', description: 'Manage and select local GGUF models for the embedded AI engine.' },
    { id: 'missing-books', name: 'Missing Book Cleaner', description: 'Identify and remove database entries for books that no longer exist on disk.' },
    { id: 'library-backup', name: 'Backup Library', description: 'Create a ZIP archive of your library data (DB, rules, taxonomy).' },
    { id: 'diagnostics', name: 'App Diagnostics', description: 'View system paths and environment info.' }
];

export default function Utilities({ scanProps, onClose, onScanComplete, initialUtilityId }) {
    const [selectedUtil, setSelectedUtil] = useState(() => {
        if (initialUtilityId) {
            return ALL_UTILITIES.find(u => u.id === initialUtilityId) || ALL_UTILITIES[0];
        }
        return ALL_UTILITIES[0];
    });

    useEffect(() => {
        console.log('[Utilities] Mounted. Initial id:', initialUtilityId, 'Selected:', selectedUtil?.id);
    }, []);

    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [models, setModels] = useState([]);
    const [missingBooks, setMissingBooks] = useState([]);
    const [lastBackupPath, setLastBackupPath] = useState('');
    const [backupDestination, setBackupDestination] = useState(() => {
        return localStorage.getItem('backupDestination') || '';
    });
    const [appInfo, setAppInfo] = useState(null);

    // Save backup destination to localStorage
    useEffect(() => {
        if (backupDestination) {
            localStorage.setItem('backupDestination', backupDestination);
        }
    }, [backupDestination]);

    // Fetch diagnostics if selected
    useEffect(() => {
        if (selectedUtil?.id === 'diagnostics' && window.electronAPI) {
            window.electronAPI.getAppInfo().then(info => setAppInfo(info));
        }

        if (selectedUtil?.id === 'ai-manager') {
            handleScanModels();
        }

        if (selectedUtil?.id === 'missing-books') {
            handleScanMissingBooks();
        }
    }, [selectedUtil]);

    const handleSelectBackupDestination = async () => {
        if (!window.electronAPI) {
            alert("Folder picker only available in Desktop app.");
            return;
        }
        const path = await window.electronAPI.openDirectory();
        if (path) setBackupDestination(path);
    };

    const handleRunBackup = async () => {
        if (!backupDestination) {
            alert('Please select a destination folder.');
            return;
        }

        setIsProcessing(true);
        setStatusMessage('Creating backup...');
        setLastBackupPath('');

        try {
            const res = await fetch(`/api/utilities/library-backup/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([backupDestination])
            });
            const data = await res.json();

            if (data.success) {
                // Use the detailed message from backend if available
                setStatusMessage(data.result?.message || 'Backup created successfully.');
                if (data.result?.fullPath) setLastBackupPath(data.result.fullPath);
                playSuccessSound();
            } else {
                setStatusMessage(`Error: ${data.error || 'Unknown error'}`);
            }
        } catch (e) {
            setStatusMessage(`Error: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenBackupFolder = async () => {
        if (!lastBackupPath) return;
        try {
            await fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath: lastBackupPath })
            });
        } catch (e) {
            console.error('Failed to open backup folder:', e);
        }
    };

    const handleScanModels = async () => {
        setIsProcessing(true);
        setStatusMessage('Scanning for models...');
        try {
            const res = await fetch('/api/utilities/ai-manager/scan', { method: 'POST' });
            // Since scan uses SSE, we need to handle it or wait for complete.
            // ai_manager.js scan() is NOT SSE-based currently, it's a direct return.
            // Wait, index.js wrap /scan in SSE... let's check index.js.

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let allResults = [];

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'complete') {
                            allResults = data.result;
                        }
                    }
                }
            }
            setModels(allResults);
            setStatusMessage('');
        } catch (e) {
            setStatusMessage(`Scan failed: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSelectModel = async (filepath) => {
        setIsProcessing(true);
        const fileName = filepath.split(/[\\/]/).pop();
        setStatusMessage(`Setting active model: ${fileName}`);
        try {
            const res = await fetch('/api/utilities/ai-manager/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([filepath])
            });
            const data = await res.json();
            if (data.success) {
                setStatusMessage('Model updated successfully.');
                handleScanModels(); // Refresh list to show ACTIVE status
                playSuccessSound();
            } else {
                setStatusMessage(`Error: ${data.error}`);
            }
        } catch (e) {
            setStatusMessage(`Error: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleScanMissingBooks = async () => {
        setIsProcessing(true);
        setStatusMessage('Scanning for missing files...');
        setMissingBooks([]);
        try {
            const res = await fetch('/api/utilities/missing-books/scan', { method: 'POST' });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let allResults = [];

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'complete') {
                            allResults = data.result;
                        } else if (data.processed) {
                            setStatusMessage(`Checking: ${data.processed} / ${data.total} books...`);
                        }
                    }
                }
            }
            setMissingBooks(allResults);
            setStatusMessage('');
        } catch (e) {
            setStatusMessage(`Scan failed: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePurgeMissingBooks = async () => {
        if (!missingBooks.length) return;
        if (!confirm(`Are you sure you want to remove ${missingBooks.length} entries from the database?`)) return;

        setIsProcessing(true);
        setStatusMessage('Purging database...');
        try {
            const paths = missingBooks.map(b => b.filepath);
            const res = await fetch('/api/utilities/missing-books/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paths)
            });
            const data = await res.json();
            if (data.success) {
                setStatusMessage(`Successfully removed ${data.result?.success?.length || 0} books.`);
                setMissingBooks([]);
                playSuccessSound();
                if (onScanComplete) onScanComplete();
            } else {
                setStatusMessage(`Error: ${data.error}`);
            }
        } catch (e) {
            setStatusMessage(`Error: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="bg-surface border border-white/5 rounded-2xl shadow-xl overflow-hidden p-6 w-full max-w-[1200px] mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                System Utilities
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Sidebar */}
                <div className="md:col-span-1 space-y-2 border-r border-white/10 pr-6 flex flex-col h-full">
                    <h3 className="text-sm font-uppercase text-secondary tracking-wider mb-4">Tools</h3>
                    <div className="flex-1 space-y-2">
                        {ALL_UTILITIES.map(util => (
                            <button
                                key={util.id}
                                onClick={() => {
                                    setSelectedUtil(util);
                                    setStatusMessage('');
                                }}
                                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${selectedUtil?.id === util.id
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    : 'hover:bg-white/5 text-neutral-300'
                                    }`}
                            >
                                <div className="font-medium">{util.name}</div>
                            </button>
                        ))}
                    </div>

                    {/* Version Info in Utility Panel */}
                    <div className="mt-8 pt-6 border-t border-white/5 text-[10px] font-mono text-neutral-600">
                        <div>Vector Bookshelf v1.0.0</div>
                        {appInfo && (
                            <div className="mt-1">
                                <div>Build: {appInfo.build}</div>
                                <div>{appInfo.buildTimestamp}</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="md:col-span-2 pl-2">
                    {selectedUtil && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xl font-bold text-neutral-100">{selectedUtil.name}</h3>
                                <p className="text-neutral-400 mt-1">{selectedUtil.description}</p>
                            </div>

                            {/* TOOL: Add Books */}
                            {selectedUtil.id === 'add-books' && scanProps && (
                                <div className="space-y-6 bg-black/20 p-6 rounded-xl border border-white/5">
                                    <div className="flex gap-4">
                                        <input
                                            type="text"
                                            value={scanProps.path}
                                            onChange={(e) => scanProps.setPath(e.target.value)}
                                            placeholder="D:\Books"
                                            className="flex-1 bg-white/50 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 text-gray-900 dark:text-neutral-200 focus:ring-2 focus:ring-primary/50 outline-none"
                                        />
                                        <button
                                            onClick={scanProps.startScan}
                                            disabled={scanProps.isScanning || (!scanProps.scanComplete && !scanProps.path)}
                                            className={`px-6 py-3 rounded-lg font-bold transition-all 
                                                ${scanProps.isScanning ? 'bg-neutral-800' : (scanProps.scanComplete ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-primary hover:bg-indigo-500 text-white')}`}
                                        >
                                            {scanProps.isScanning ? 'Scanning...' : (scanProps.scanComplete ? 'Scan Complete (Clear)' : 'Scan Library')}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                        <div className="bg-slate-100 dark:bg-black/20 p-4 rounded-lg">
                                            <div className="text-xs text-secondary uppercase tracking-wider">Found</div>
                                            <div className="text-2xl font-bold text-gray-900 dark:text-white">{scanProps.stats.found}</div>
                                        </div>
                                        <div className="bg-slate-100 dark:bg-black/20 p-4 rounded-lg border-b-2 border-emerald-500/20">
                                            <div className="text-xs text-secondary uppercase tracking-wider">Added</div>
                                            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{scanProps.stats.added}</div>
                                        </div>
                                    </div>
                                    {scanProps.isScanning && (
                                        <div className="text-xs font-mono text-secondary truncate animate-pulse">
                                            {scanProps.stats.currentFile || 'Accessing filesystem...'}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TOOL: AI Model Manager */}
                            {selectedUtil.id === 'ai-manager' && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5">
                                        <div className="text-sm text-neutral-400">
                                            Found {models.length} models in search paths.
                                        </div>
                                        <button
                                            onClick={handleScanModels}
                                            disabled={isProcessing}
                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all"
                                        >
                                            {isProcessing ? 'Scanning...' : 'Refresh Model List'}
                                        </button>
                                    </div>

                                    {statusMessage && (
                                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono rounded-lg">
                                            {statusMessage}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-3">
                                        {models.length > 0 ? models.map((model, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleSelectModel(model.filepath)}
                                                className={`p-4 rounded-xl border cursor-pointer transition-all flex justify-between items-center group
                                                    ${model.reason === 'ACTIVE'
                                                        ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                                                        : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                                            >
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`text-sm font-bold truncate ${model.reason === 'ACTIVE' ? 'text-indigo-300' : 'text-neutral-200'}`}>
                                                            {model.name}
                                                        </span>
                                                        {model.reason === 'ACTIVE' && (
                                                            <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                                                                ACTIVE
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-4 mt-1">
                                                        <span className="text-[10px] font-mono text-neutral-500">{model.size}</span>
                                                        <span className="text-[10px] font-mono text-neutral-600 truncate">{model.folder}</span>
                                                    </div>
                                                </div>
                                                <div className={`text-xs font-bold transition-all ${model.reason === 'ACTIVE' ? 'text-indigo-400' : 'text-neutral-500 opacity-0 group-hover:opacity-100'}`}>
                                                    {model.reason === 'ACTIVE' ? '✓ SELECTED' : 'SELECT MODEL →'}
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="p-12 text-center text-neutral-500 italic bg-black/10 rounded-xl border border-dashed border-white/10">
                                                No GGUF models found. Move .gguf files to the /models directory.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TOOL: Missing Book Cleaner */}
                            {selectedUtil.id === 'missing-books' && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5">
                                        <div className="text-sm text-neutral-400">
                                            {missingBooks.length === 0 ? 'No missing books found.' : `Found ${missingBooks.length} missing books.`}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleScanMissingBooks}
                                                disabled={isProcessing}
                                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all"
                                            >
                                                {isProcessing ? 'Scanning...' : 'Re-Scan'}
                                            </button>
                                            {missingBooks.length > 0 && (
                                                <button
                                                    onClick={handlePurgeMissingBooks}
                                                    disabled={isProcessing}
                                                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/20 rounded-lg text-sm font-bold transition-all"
                                                >
                                                    Purge All
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {statusMessage && (
                                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono rounded-lg">
                                            {statusMessage}
                                        </div>
                                    )}

                                    <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                        {missingBooks.map((book, idx) => (
                                            <div key={idx} className="p-3 bg-black/20 border border-white/5 rounded-lg flex flex-col">
                                                <div className="text-sm text-neutral-200 truncate">{book.filepath.split(/[\\/]/).pop()}</div>
                                                <div className="text-[10px] text-neutral-500 font-mono truncate">{book.filepath}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* TOOL: Library Backup */}
                            {selectedUtil.id === 'library-backup' && (
                                <div className="space-y-6 bg-black/20 p-6 rounded-xl border border-white/5">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-neutral-400">Destination Folder</label>
                                        <div className="flex gap-3">
                                            <input
                                                type="text"
                                                readOnly
                                                value={backupDestination}
                                                placeholder="Select destination..."
                                                className="flex-1 bg-white/5 dark:bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm font-mono text-neutral-200"
                                            />
                                            <button
                                                onClick={handleSelectBackupDestination}
                                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-neutral-300 rounded-lg text-sm transition-colors"
                                            >
                                                Browse...
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleRunBackup}
                                        disabled={isProcessing || !backupDestination}
                                        className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20"
                                    >
                                        {isProcessing ? 'Backing up...' : 'Create Backup'}
                                    </button>

                                    {statusMessage && (
                                        <div className={`p-4 rounded-lg font-mono text-sm ${statusMessage.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                            {statusMessage}
                                        </div>
                                    )}

                                    {lastBackupPath && !isProcessing && (
                                        <button
                                            onClick={handleOpenBackupFolder}
                                            className="w-full py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-sm font-medium rounded-lg border border-indigo-500/30"
                                        >
                                            View in Folder
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* TOOL: Diagnostics */}
                            {selectedUtil.id === 'diagnostics' && (
                                <div className="space-y-4">
                                    {appInfo ? (
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                                <div className="text-xs text-secondary uppercase tracking-wider mb-1">Mode</div>
                                                <div className={`text-lg font-bold ${appInfo.isPackaged ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {appInfo.isPackaged ? 'Packaged' : 'Development'}
                                                </div>
                                            </div>
                                            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                                <div className="text-xs text-secondary uppercase tracking-wider mb-1">User Data Path</div>
                                                <div className="text-sm font-mono text-neutral-300 break-all select-all bg-black/40 p-2 mt-1 rounded border border-white/5">
                                                    {appInfo.userDataPath}
                                                </div>
                                            </div>
                                            {!appInfo.isPackaged && appInfo.build > 0 && (
                                                <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                                    <div className="text-xs text-secondary uppercase tracking-wider mb-1">Build Info</div>
                                                    <div className="text-sm font-mono text-neutral-300">
                                                        Build {appInfo.build} ({appInfo.buildTimestamp})
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-12 text-center text-neutral-500 italic bg-black/10 rounded-xl border border-dashed border-white/10">
                                            Diagnostics only available in Desktop environment.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
