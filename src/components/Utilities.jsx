import { useState, useEffect } from 'react';

export default function Utilities() {
    const [utilities, setUtilities] = useState([]);
    const [selectedUtil, setSelectedUtil] = useState(null);
    const [scanResult, setScanResult] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const [progress, setProgress] = useState(null); // { processed, total }

    useEffect(() => {
        fetch('/api/utilities')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setUtilities(data.utilities);
                }
            })
            .catch(err => console.error('Failed to load utilities:', err));
    }, []);

    const handleScan = async (util) => {
        setIsScanning(true);
        setScanResult(null);
        setProgress(null);
        setStatusMessage('Starting scan...');

        try {
            const response = await fetch(`/api/utilities/${util.id}/scan`, { method: 'POST' });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'progress') {
                                setProgress({ processed: data.processed, total: data.total });
                                setStatusMessage(`Scanning... ${data.processed} / ${data.total}`);
                            } else if (data.type === 'complete') {
                                setScanResult(data.result);
                                setStatusMessage(`Scan complete. Found ${data.result.length} items.`);
                                setIsScanning(false);
                            } else if (data.type === 'error') {
                                setStatusMessage(`Error: ${data.message}`);
                                setIsScanning(false);
                            }
                        } catch (e) {
                            console.error('Parse error', e);
                        }
                    }
                }
            }
        } catch (e) {
            setStatusMessage(`Error: ${e.message}`);
            setIsScanning(false);
        }
    };

    const handleProcess = async (util, items) => {
        if (!confirm(`Are you sure you want to process ${items.length} items? This action may be irreversible.`)) return;

        setIsProcessing(true);
        setStatusMessage('Processing...');

        try {
            // Depending on utility, we might send IDs or Filepaths.
            // For missing-books, we send filepaths.
            // We assume the scanResult is an array of objects with a 'filepath' property or just strings.
            // The utility expects just the list of identifiers to process.

            // Extract what to send based on the scan result data structure
            const payload = items.map(item => item.filepath || item);

            const res = await fetch(`/api/utilities/${util.id}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setStatusMessage(`Operation complete. Success: ${data.result.success.length}, Failed: ${data.result.failed.length}`);
                // Clear scan result after successful processing
                setScanResult(null);
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
        <div className="bg-surface border border-white/5 rounded-2xl shadow-xl overflow-hidden p-6 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                System Utilities
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* List of Utilities */}
                <div className="md:col-span-1 space-y-2 border-r border-white/10 pr-6">
                    <h3 className="text-sm font-uppercase text-secondary tracking-wider mb-4">Available Tools</h3>
                    {utilities.length === 0 && <div className="text-neutral-500 italic">No utilities found.</div>}
                    {utilities.map(util => (
                        <button
                            key={util.id}
                            onClick={() => { setSelectedUtil(util); setScanResult(null); setStatusMessage(''); setProgress(null); }}
                            className={`w-full text-left px-4 py-3 rounded-xl transition-all ${selectedUtil?.id === util.id
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'hover:bg-white/5 text-neutral-300'
                                }`}
                        >
                            <div className="font-medium">{util.name}</div>
                        </button>
                    ))}
                </div>

                {/* Detail View */}
                <div className="md:col-span-2 pl-2">
                    {selectedUtil ? (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xl font-bold text-neutral-100">{selectedUtil.name}</h3>
                                <p className="text-neutral-400 mt-1">{selectedUtil.description}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                {selectedUtil.actions?.find(a => a.type === 'scan') && (
                                    <button
                                        onClick={() => handleScan(selectedUtil)}
                                        disabled={isScanning || isProcessing}
                                        className="px-5 py-2 bg-primary hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                    >
                                        {isScanning ? 'Scanning...' : 'Start Scan'}
                                    </button>
                                )}
                            </div>

                            {/* Status Output */}
                            {statusMessage && (
                                <div className={`p-4 rounded-lg font-mono text-sm ${statusMessage.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-black/30 text-emerald-400 border border-emerald-500/10'}`}>
                                    {statusMessage}
                                    {/* Progress Bar */}
                                    {isScanning && progress && (
                                        <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 transition-all duration-300"
                                                style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Scan Results */}
                            {scanResult && scanResult.length > 0 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-amber-400">Issues Found ({scanResult.length})</h4>
                                        <button
                                            onClick={() => handleProcess(selectedUtil, scanResult)}
                                            disabled={isProcessing}
                                            className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            {isProcessing ? 'Processing...' : 'Fix All Issues'}
                                        </button>
                                    </div>

                                    <div className="max-h-60 overflow-y-auto bg-black/20 rounded-lg border border-white/5 divide-y divide-white/5">
                                        {scanResult.map((item, idx) => (
                                            <div key={idx} className="p-3 text-sm flex justify-between gap-4">
                                                <span className="text-neutral-300 truncate" title={item.filepath}>{item.filepath}</span>
                                                <span className="text-neutral-500 whitespace-nowrap">{item.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {scanResult && scanResult.length === 0 && !isScanning && (
                                <div className="text-center py-8 text-neutral-500 bg-black/20 rounded-lg border border-white/5">
                                    No issues found. Everything looks good!
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-2">
                            <svg className="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <p>Select a utility to begin</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
