import { useState, useEffect, useRef } from 'react'

function App() {
  const [path, setPath] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [isProcessingMetadata, setIsProcessingMetadata] = useState(false)
  const [isProcessingContent, setIsProcessingContent] = useState(false)
  const [stats, setStats] = useState({
    found: 0,
    added: 0,
    skipped: 0,
    metadataExtracted: 0,
    metadataFailed: 0,
    currentFile: ''
  })
  const [taggingStats, setTaggingStats] = useState({ processed: 0, total: 0, current: '' })
  const [totalLibraryCount, setTotalLibraryCount] = useState(0)
  const [books, setBooks] = useState([])

  // Taxonomy Doctor State
  const [showTaxonomyDoctor, setShowTaxonomyDoctor] = useState(false)
  const [doctorTag, setDoctorTag] = useState('')
  const [doctorResult, setDoctorResult] = useState(null)
  const [rulesContent, setRulesContent] = useState('')
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [isEditingRules, setIsEditingRules] = useState(false)

  // Phase 1 UI improvements
  const [scanSectionCollapsed, setScanSectionCollapsed] = useState(() => {
    const saved = localStorage.getItem('scanCollapsed')
    return saved === 'true'
  })
  const [activeTagFilters, setActiveTagFilters] = useState([])
  const [activeAuthorFilters, setActiveAuthorFilters] = useState([])
  const [activeYearFilter, setActiveYearFilter] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'title', direction: 'asc' })
  const [hoveredRow, setHoveredRow] = useState(null)
  const [scanningBookId, setScanningBookId] = useState(null)
  const [syncingMetadataId, setSyncingMetadataId] = useState(null)
  const [editingCell, setEditingCell] = useState(null) // { id: 1, field: 'title' }
  const [isSyncingTaxonomy, setIsSyncingTaxonomy] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(500)
  const [exportPath, setExportPath] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [taxonomyStats, setTaxonomyStats] = useState({ state: 'idle', current: 0, total: 0, message: '' })
  const [isBackendOnline, setIsBackendOnline] = useState(false)
  const [isAiOnline, setIsAiOnline] = useState(false)
  const [dismissedErrorPaths, setDismissedErrorPaths] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissedErrorPaths') || '[]')
    } catch {
      return []
    }
  })

  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // FIX: Use ref to access latest search query inside long-running async closures
  const searchRef = useRef(debouncedSearch)

  useEffect(() => {
    searchRef.current = debouncedSearch
  }, [debouncedSearch])

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch on Debounce Change
  useEffect(() => {
    setCurrentPage(1)
    fetchBooks()
  }, [debouncedSearch])

  // Poll server status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000) // 1s timeout

        const res = await fetch(`/api/health?t=${Date.now()}`, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (res.ok) {
          try {
            const data = await res.json()
            if (data.status === 'ok') {
              setIsBackendOnline(true)
              setIsAiOnline(data.ai === true)
            } else {
              setIsBackendOnline(false)
              setIsAiOnline(false)
            }
          } catch (jsonErr) {
            setIsBackendOnline(false)
            setIsAiOnline(false)
          }
        } else {
          setIsBackendOnline(false)
          setIsAiOnline(false)
        }
      } catch (e) {
        setIsBackendOnline(false)
        setIsAiOnline(false)
      }
    }

    // Check Scan Status (Headless support)
    const checkScanStatus = async () => {
      try {
        const res = await fetch('/api/scan/status');
        const data = await res.json();

        if (data.active) {
          // If backend says active but frontend didn't know, Update UI
          setIsProcessingContent(true);
          setTaggingStats({
            processed: data.processed,
            total: data.total,
            current: data.currentFile || 'Processing...'
          });
        } else if (isProcessingContent && !data.active) {
          // Backend finished but UI still thinks it's running? 
          // Wait, maybe we just finished. 
          // Let's only turn OFF if we were polling for it.
          // Actually, if we are in "Zombie" mode (reloaded page), 
          // we want to know when it stops.
          // But we don't want to conflict with the event stream if it's live.
          // Simpler: Just sync stats if active.

          // If we JUST reloaded the page, isProcessingContent is false.
          // If data.active is false, we stay false.

          // If we are running (isProcessingContent=true) and data.active=false...
          // It might mean the scan just finished.
          // But normally the SSE 'complete' event handles this.
          // However, if we lost SSE (reload), we depend on this poller to finish.
          setIsProcessingContent(false);
        }
      } catch (e) {
        console.error("Failed to check scan status", e);
      }
    };

    checkHealth() // Initial check
    checkScanStatus() // Initial check

    // If we are actively scanning/processing, ping LESS often to save resources (15s)
    // Otherwise, ping frequently to show responsiveness (2s)
    const pollInterval = (isScanning || isProcessingContent || isSyncingTaxonomy) ? 5000 : 2000;
    // We increased frequency during scan for better "Resume" feel, 5s is fine.

    const interval = setInterval(() => {
      checkHealth();
      checkScanStatus();
    }, pollInterval);

    return () => clearInterval(interval)
  }, [isScanning, isProcessingContent, isSyncingTaxonomy])

  const fetchBooks = async () => {
    try {
      const query = new URLSearchParams()
      // FIX: Read from ref to avoid stale closure issues during long scans
      if (searchRef.current) query.append('q', searchRef.current)

      const res = await fetch(`/api/books?${query.toString()}`)

      const totalHeader = res.headers.get('X-Library-Size')
      if (totalHeader) {
        setTotalLibraryCount(parseInt(totalHeader, 10))
      }

      const data = await res.json()
      setBooks(data)
    } catch (e) {
      console.error("Failed to fetch books", e)
    }
  }

  useEffect(() => {
    if (showTaxonomyDoctor) {
      fetch('/api/taxonomy/rules')
        .then(res => res.json())
        .then(data => {
          if (data.success) setRulesContent(data.content || '')
        })
        .catch(e => console.error("Failed to load rules", e))
    }
  }, [showTaxonomyDoctor])

  useEffect(() => {
    if (showRulesEditor) {
      fetch('/api/taxonomy/rules')
        .then(res => res.json())
        .then(data => {
          if (data.success) setRulesContent(data.content || '')
        })
        .catch(e => console.error("Failed to load rules", e))
    }
  }, [showRulesEditor])

  useEffect(() => {
    fetchBooks()
  }, [])

  const startScan = async () => {
    if (!path) return
    setIsScanning(true)
    setStats({ found: 0, added: 0, skipped: 0, currentFile: 'Starting...' })

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'progress') {
              setStats({
                found: data.found,
                added: data.added,
                skipped: data.skipped,
                metadataExtracted: data.metadataExtracted,
                metadataFailed: data.metadataFailed,
                currentFile: data.currentFile
              })
            } else if (data.type === 'complete') {
              setIsScanning(false)
              fetchBooks() // Refresh list
            }
          }
        }
      }
    } catch (error) {
      console.error('Scan failed', error)
      setIsScanning(false)
    }
  }


  const startTagGeneration = async () => {
    // Check if we are filtering
    const hasFilters = activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || searchQuery;
    const targetFilepaths = hasFilters ? filteredBooks.map(b => b.filepath) : null;

    if (hasFilters && targetFilepaths.length === 0) {
      alert("No books match your filter!");
      return;
    }

    if (hasFilters && !confirm(`Scan data for ${targetFilepaths.length} filtered books?`)) {
      return;
    }

    setIsProcessingContent(true)
    try {
      const response = await fetch('/api/books/process-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetFilepaths })
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'start') {
              setTaggingStats({ processed: 0, total: data.total, current: 'Starting AI analysis...' })
            } else if (data.type === 'progress') {
              setTaggingStats({
                processed: data.processed,
                total: data.total,
                current: data.current
              })
              fetchBooks() // Refresh list after each book
            } else if (data.type === 'complete') {
              setIsProcessingContent(false)
              fetchBooks()
            }
          }
        }
      }
    } catch (error) {
      console.error('Tag generation failed', error)
      setIsProcessingContent(false)
    }
  }

  const handleSingleScan = async (bookId, filepath) => {
    setScanningBookId(bookId)
    try {
      const response = await fetch('/api/scan-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath })
      })
      if (response.ok) {
        await fetchBooks()
      } else {
        const error = await response.json()
        alert(`Scan failed: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    } finally {
      setScanningBookId(null)
    }
  }

  const handleMetadataSync = async (bookId, filepath) => {
    setSyncingMetadataId(bookId)
    try {
      const response = await fetch('/api/scan-metadata-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath })
      })
      if (response.ok) {
        await fetchBooks()
        // Optional: show a small toast or subtle feedback
      } else {
        const error = await response.json()
        alert(`Sync failed: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    } finally {
      setSyncingMetadataId(null)
    }
  }

  const handleSyncTaxonomy = async () => {
    setIsSyncingTaxonomy(true)
    setTaxonomyStats({ state: 'starting', current: 0, total: 0, message: 'Starting...' })

    try {
      const response = await fetch('/api/scan-master-tags', {
        method: 'POST'
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'start') {
              setTaxonomyStats({ state: 'learning', current: 0, total: 0, message: 'Analyzing existing taxonomy...' })
            } else if (data.type === 'progress_learning') {
              // UX IMPROVEMENT: Show global tag progress (e.g. 4500/8000) instead of relative batches (1/8)
              // If global stats are missing (backward compat), fall back to batches
              const currentMsg = data.processedGlobal
                ? `Learning tags... (${data.processedGlobal} / ${data.totalGlobal})`
                : `Learning batch ${data.currentBatch}/${data.totalBatches}`;

              setTaxonomyStats({
                state: 'learning',
                current: data.processedGlobal || data.currentBatch,
                total: data.totalGlobal || data.totalBatches,
                message: currentMsg
              })
            } else if (data.type === 'phase_applying') {
              setTaxonomyStats({ state: 'applying', current: 0, total: 0, message: 'Applying tags to library...' })
            } else if (data.type === 'progress_applying') {
              setTaxonomyStats({
                state: 'applying',
                current: data.current,
                total: data.total,
                message: `Applying to book ${data.current} of ${data.total}`
              })
            } else if (data.type === 'complete') {
              setIsSyncingTaxonomy(false)
              setTaxonomyStats({ state: 'idle', current: 0, total: 0, message: '' })
              await fetchBooks()
              alert(`Taxonomy sync complete! Applied to ${data.count} books.`)
            } else if (data.type === 'error') {
              alert(`Sync failed: ${data.message}`)
              setIsSyncingTaxonomy(false)
            }
          }
        }
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
      setIsSyncingTaxonomy(false)
    } finally {
      setTaxonomyStats({ state: 'idle', current: 0, total: 0, message: '' })
    }
  }

  const handleExport = async () => {
    if (!exportPath) {
      alert("Please specify a destination folder.")
      return
    }

    setIsExporting(true)
    const filepaths = filteredBooks.map(b => b.filepath)

    try {
      const response = await fetch('/api/books/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepaths, destination: exportPath })
      })

      const data = await response.json()
      if (response.ok) {
        alert(data.message)
        setExportPath('')
      } else {
        alert(`Export failed: ${data.error}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleManualUpdate = async (id, field, value) => {
    try {
      const response = await fetch('/api/books/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, value })
      })
      if (response.ok) {
        setBooks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b))
        setEditingCell(null)
      } else {
        const error = await response.json()
        alert(`Update failed: ${error.error}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    }
  }

  // Helper functions for Phase 1 features
  const toggleScanSection = () => {
    const newState = !scanSectionCollapsed
    setScanSectionCollapsed(newState)
    localStorage.setItem('scanCollapsed', newState.toString())
  }

  const handleTagClick = (tag) => {
    setActiveTagFilters(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const removeTagFilter = (tag) => {
    setActiveTagFilters(prev => prev.filter(t => t !== tag))
  }

  const handleAuthorClick = (author) => {
    setActiveAuthorFilters(prev =>
      prev.includes(author)
        ? prev.filter(a => a !== author)
        : [...prev, author]
    )
  }

  const removeAuthorFilter = (author) => {
    setActiveAuthorFilters(prev => prev.filter(a => a !== author))
  }

  const clearAllFilters = () => {
    setActiveTagFilters([])
    setActiveAuthorFilters([])
    setActiveYearFilter(null)
  }

  const parseAuthors = (authorStr) => {
    if (!authorStr) return []

    // Check if this looks like "Last, First" format
    // Heuristic: if there's a comma followed by a single word (first name), it's likely "Last, First"
    const singleAuthorPattern = /^[^,]+,\s*\w+(\s+\w\.?)?$/
    if (singleAuthorPattern.test(authorStr.trim())) {
      // Single author in "Last, First" format - reverse it
      const parts = authorStr.split(',').map(s => s.trim())
      return [parts.slice(1).concat(parts[0]).join(' ')]
    }

    // Otherwise, split on semicolons, ampersands, or " and "
    return authorStr.split(/;|&|\s+and\s+/i)
      .map(a => a.trim())
      .filter(a => a)
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Filter books by active tags AND authors
  const filteredBooks = books.filter(book => {
    let matchesTags = true
    let matchesAuthors = true

    if (activeTagFilters.length > 0) {
      const bookTags = book.tags ? book.tags.split(',').map(t => t.trim()) : []
      const masterTags = book.master_tags ? book.master_tags.split(',').map(t => t.trim()) : []
      const allTags = [...bookTags, ...masterTags]
      matchesTags = activeTagFilters.every(filter => allTags.includes(filter))
    }

    if (activeAuthorFilters.length > 0) {
      if (!book.author) {
        matchesAuthors = false
      } else {
        const bookAuthors = parseAuthors(book.author)
        matchesAuthors = activeAuthorFilters.every(filter => bookAuthors.includes(filter))
      }
    }

    return matchesTags && matchesAuthors && (!activeYearFilter || book.publication_year === activeYearFilter)
  })


  // Error Reporting Logic
  const errorBooks = books.filter(b => b.tags && (b.tags.includes('Error:') || b.tags.includes('Skipped:')))
  const newErrorBooks = errorBooks.filter(b => !dismissedErrorPaths.includes(b.filepath))

  const handleExportErrors = async () => {
    if (newErrorBooks.length === 0) return;
    if (!confirm('Generate a report of all failed/skipped books?')) return;
    try {
      const res = await fetch('/api/books/export-errors', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Report generated!\n\nFound: ${data.count} issues\nSaved to: SCAN_ERRORS.txt`);
        const allPaths = errorBooks.map(b => b.filepath);
        setDismissedErrorPaths(allPaths);
        localStorage.setItem('dismissedErrorPaths', JSON.stringify(allPaths));
      } else {
        alert('Failed to generate report.');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // Sorting Logic
  const sortedBooks = [...filteredBooks].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle nulls
    if (aValue === null || aValue === undefined) aValue = '';
    if (bValue === null || bValue === undefined) bValue = '';

    // Handle Strings (Case insensitive)
    if (typeof aValue === 'string') aValue = aValue.toLowerCase();
    if (typeof bValue === 'string') bValue = bValue.toLowerCase();

    // Handle Numbers (Years)
    if (sortConfig.key === 'publication_year') {
      aValue = Number(aValue) || 0;
      bValue = Number(bValue) || 0;
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedBooks.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBooks = sortedBooks.slice(startIndex, endIndex)

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Reset to page 1 when filters change
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTagFilters, activeAuthorFilters, activeYearFilter])

  // Auto-collapse scan section after successful scan
  useEffect(() => {
    if (!isScanning && stats.added > 0 && books.length > 0) {
      setScanSectionCollapsed(true)
      localStorage.setItem('scanCollapsed', 'true')
    }
  }, [isScanning, stats.added, books.length])

  return (
    <div className="min-h-screen bg-background text-neutral-100 font-sans selection:bg-primary/30 relative">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Server Status Indicators */}
        <div className="absolute top-6 right-6 flex flex-col gap-2 z-50">
          {/* Backend Status */}
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg transition-all duration-300 hover:bg-black/60">
            <div className={`w-2 h-2 rounded-full transition-all duration-500 ${isBackendOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse'}`} />
            <span className={`text-xs font-medium transition-colors duration-300 ${isBackendOnline ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              {isBackendOnline ? 'System Online' : 'System Offline'}
            </span>
          </div>

          {/* AI Server Status */}
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg transition-all duration-300 hover:bg-black/60">
            <div className={`w-2 h-2 rounded-full transition-all duration-500 ${isAiOnline ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-neutral-600'}`} />
            <span className={`text-xs font-medium transition-colors duration-300 ${isAiOnline ? 'text-indigo-400/80' : 'text-neutral-500'}`}>
              {isAiOnline ? 'AI Model Ready' : 'AI Offline'}
            </span>
          </div>
        </div>

        <header className="mb-12 text-center space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Vector Bookshelf
          </h1>
        </header>

        <main className="space-y-8">
          {/* Collapsible Scan Section */}
          <div className="bg-surface border border-white/5 rounded-2xl shadow-xl overflow-hidden">
            {/* Collapsed State - Compact Button */}
            {scanSectionCollapsed ? (
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleScanSection}
                    className="px-6 py-2 bg-primary hover:bg-indigo-500 text-white rounded-lg font-medium transition-all"
                  >
                    + Add Books
                  </button>
                  {totalLibraryCount > 0 && (
                    <span className="text-sm text-secondary">
                      {totalLibraryCount} books in library
                    </span>
                  )}
                </div>
                <button
                  onClick={toggleScanSection}
                  className="text-secondary hover:text-white transition-colors"
                  title="Expand scan section"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            ) : (
              /* Expanded State - Full Form */
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Scan Library</h2>
                  <button
                    onClick={toggleScanSection}
                    className="text-secondary hover:text-white transition-colors"
                    title="Collapse scan section"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="D:\Books"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-neutral-200 focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                    <button
                      onClick={startScan}
                      disabled={isScanning || !path}
                      className={`px-6 py-3 rounded-lg font-bold transition-all ${isScanning ? 'bg-neutral-800' : 'bg-primary hover:bg-indigo-500 text-white'}`}
                    >
                      {isScanning ? 'Scanning...' : 'Scan Library'}
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-xs text-secondary uppercase tracking-wider">Found</div>
                      <div className="text-2xl font-bold">{stats.found}</div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg border-b-2 border-emerald-500/20">
                      <div className="text-xs text-secondary uppercase tracking-wider">Added</div>
                      <div className="text-2xl font-bold text-emerald-400">{stats.added}</div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg border-b-2 border-cyan-500/20">
                      <div className="text-xs text-secondary uppercase tracking-wider">Metadata</div>
                      <div className="text-2xl font-bold text-cyan-400">
                        {stats.metadataExtracted}
                        {stats.metadataFailed > 0 && <span className="text-xs text-red-400/70 ml-2">({stats.metadataFailed} fail)</span>}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-xs text-secondary uppercase tracking-wider">Duplicates</div>
                      <div className="text-2xl font-bold text-amber-400">{stats.skipped}</div>
                    </div>
                  </div>
                  {isScanning && <div className="text-xs font-mono text-secondary truncate">{stats.currentFile}</div>}
                </div>
              </div>
            )}
          </div>


          {/* Sticky Library Header with Filters */}
          <div className="sticky top-0 z-10 bg-background pb-4 shadow-xl shadow-background/50 pt-2">
            <div className="flex flex-col gap-4 bg-surface/50 backdrop-blur-md p-4 rounded-xl border border-white/5">

              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  Library
                  <span className="text-sm font-normal text-secondary bg-black/30 px-3 py-0.5 rounded-full border border-white/5">
                    {searchQuery ? `${books.length} results` : `${books.length} books`}
                  </span>
                </h2>

                <div className="flex gap-2">
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={startTagGeneration}
                      disabled={isProcessingMetadata || isProcessingContent || isSyncingTaxonomy || books.length === 0}
                      className={`px-6 py-2 rounded-lg font-medium border border-cyan-500/20 bg-cyan-950/20 text-cyan-400 hover:bg-cyan-500/10 ${isProcessingContent ? 'bg-neutral-800' : ''}`}
                    >
                      {isProcessingContent
                        ? `AI Data Scan: ${taggingStats.processed}/${taggingStats.total}`
                        : (activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || searchQuery
                          ? `Scan ${filteredBooks.length} Filtered`
                          : 'AI Data Scan (All)')}
                    </button>
                    {isProcessingContent && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/scan/stop', { method: 'POST' });
                            const data = await res.json();
                            console.log('Stop requested:', data);
                            if (data.success) {
                              setIsProcessingContent(false);
                            } else {
                              alert('Stop failed: ' + data.message);
                            }
                          } catch (e) {
                            console.error('Failed to stop scan:', e);
                            alert('Failed to connect to server to stop scan.');
                          }
                        }}
                        className="p-2 rounded-lg border border-red-500/20 bg-red-950/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                        title="Force Stop (Cancel Server Scan)"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setShowTaxonomyDoctor(true)}
                    className="p-2 rounded-lg border border-purple-500/20 bg-purple-950/20 text-purple-400 hover:bg-purple-500/10 transition-colors"
                    title="Taxonomy Doctor (Fix Tags)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </button>

                  <button
                    onClick={handleSyncTaxonomy}
                    disabled={isSyncingTaxonomy || isScanning || isProcessingContent || books.length === 0}
                    className={`relative px-4 py-2 rounded-lg font-medium border border-amber-500/20 bg-amber-950/20 text-amber-400 hover:bg-amber-500/10 ${isSyncingTaxonomy ? 'bg-neutral-800' : ''} ${!isSyncingTaxonomy && books.some(b => b.tags && !b.master_tags) ? 'animate-pulse ring-1 ring-amber-500' : ''}`}
                    title="AI groups your tags into categories"
                  >
                    {isSyncingTaxonomy ? (taxonomyStats.message || 'Syncing...') : 'Rescan Categories'}
                  </button>

                  {newErrorBooks.length > 0 && (
                    <button
                      onClick={handleExportErrors}
                      className={`px-4 py-2 rounded-lg font-medium border transition-colors flex items-center gap-2 ${newErrorBooks.length > 0 ? 'border-red-500/50 bg-red-950/30 text-red-400 hover:bg-red-900/50 animate-pulse' : 'border-red-500/10 bg-red-950/5 text-red-500/50'}`}
                      title={newErrorBooks.length > 0 ? "New errors found!" : "All errors dismissed"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export Errors {newErrorBooks.length > 0 && `(${newErrorBooks.length})`}
                    </button>
                  )}
                </div>
              </div>

              {/* SEARCH BAR */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search titles, authors, tags..."
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-neutral-200 placeholder:text-neutral-500 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                />
                <svg className="w-5 h-5 text-neutral-500 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3.5 text-neutral-500 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TAXONOMY DOCTOR MODAL */}
          {showTaxonomyDoctor && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="bg-neutral-900 border border-purple-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl shadow-purple-900/20">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <span className="text-purple-400">🩺</span> Taxonomy Doctor
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1">Retroactively fix tags using your Rules.</p>
                  </div>
                  <button onClick={() => setShowTaxonomyDoctor(false)} className="text-neutral-500 hover:text-white">✕</button>
                </div>


                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                  {/* Action 0: Rules Editor Link */}
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 hover:border-r-purple-500/30 transition-colors flex justify-between items-center group cursor-pointer" onClick={() => setShowRulesEditor(true)}>
                    <div>
                      <h4 className="font-semibold text-white/90 group-hover:text-purple-300 transition-colors">Tagging Rules</h4>
                      <p className="text-xs text-neutral-400">View and edit your context rules in a large window.</p>
                    </div>
                    <button
                      className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-sm text-white transition-colors"
                    >
                      Open Editor ↗
                    </button>
                  </div>

                  {/* Action 1: Apply Implications */}
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors">
                    <h4 className="font-semibold text-purple-200 mb-2">1. Apply Automatic Hierarchies (Instant)</h4>
                    <p className="text-xs text-neutral-400 mb-4">Good for strict parent/child rules (e.g. "ML ensures AI"). Does <strong>not</strong> re-read books. Safe and fast.</p>
                    <button
                      onClick={async () => {
                        setDoctorResult('Running logic updates...');
                        try {
                          const res = await fetch('/api/taxonomy/apply-implications', { method: 'POST' });
                          const data = await res.json();
                          setDoctorResult(`Applied ${data.changes} logic fixes.\nRules: ${data.applied.join(', ') || 'None triggered'}`);
                          fetchBooks(); // Refresh UI
                        } catch (e) {
                          setDoctorResult('Error: ' + e.message);
                        }
                      }}
                      className="w-full bg-purple-900/30 hover:bg-purple-800/50 text-purple-300 py-2 rounded-lg border border-purple-500/20 transition-all font-medium"
                    >
                      Apply Hierarchies
                    </button>
                  </div>

                  {/* Action 2: Re-Scan Tag */}
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-colors">
                    <h4 className="font-semibold text-cyan-200 mb-2">2. Fix Ambiguous Tags (Deep AI Re-Scan)</h4>
                    <p className="text-xs text-neutral-400 mb-4">Use for context errors (e.g. "Python" Snake vs Code). <strong>Wipes metadata</strong> so the AI can re-read the book using your new Rules.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Python"
                        value={doctorTag}
                        onChange={(e) => setDoctorTag(e.target.value)}
                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-cyan-500/50 outline-none"
                      />
                      <button
                        onClick={async () => {
                          if (!doctorTag) return;
                          if (!confirm(`Are you sure you want to WIPEOUT metadata for all books tagged '${doctorTag}'? They will be re-scanned.`)) return;
                          setDoctorResult(`Resetting '${doctorTag}'...`);
                          try {
                            const res = await fetch('/api/taxonomy/re-eval', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ tag: doctorTag })
                            });
                            const data = await res.json();
                            setDoctorResult(`Reset ${data.count} books. Please run 'AI Data Scan' to process them.`);
                            fetchBooks(); // Refresh UI
                          } catch (e) {
                            setDoctorResult('Error: ' + e.message);
                          }
                        }}
                        className="bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-300 px-4 py-2 rounded-lg border border-cyan-500/20 transition-all font-medium"
                      >
                        Reset Tag
                      </button>
                    </div>
                  </div>

                  {/* Output Log */}
                  {doctorResult && (
                    <div className="bg-black p-3 rounded-lg border border-white/10 font-mono text-xs text-green-400 whitespace-pre-wrap">
                      {doctorResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LARGE RULES EDITOR MODAL */}
          {showRulesEditor && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
              <div className="bg-neutral-900 border border-purple-500/30 rounded-2xl w-[90vw] h-[85vh] shadow-2xl flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-white/5">
                  <div>
                    <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                      <span className="text-purple-400">📝</span> Tagging Rules Editor
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1">Edit `tagging_rules.md`. These rules are injected into the AI context.</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/taxonomy/rules', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: rulesContent })
                          })
                          const data = await res.json()
                          if (data.success) {
                            alert('Rules Saved!')
                            setShowRulesEditor(false)
                          } else {
                            alert('Error saving: ' + data.error)
                          }
                        } catch (e) { alert('Error: ' + e.message) }
                      }}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-purple-900/50"
                    >
                      Save Rules
                    </button>
                    <button onClick={() => setShowRulesEditor(false)} className="px-4 py-2 rounded-lg text-neutral-400 hover:bg-white/10 transition-colors">Cancel</button>
                  </div>
                </div>

                <div className="flex-1 p-6 bg-black/50">
                  <textarea
                    value={rulesContent}
                    onChange={(e) => setRulesContent(e.target.value)}
                    className="w-full h-full bg-transparent border-none outline-none font-mono text-sm text-neutral-200 resize-none leading-relaxed"
                    placeholder="# Write your tagging rules here..."
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          )}


          {/* Active Filter Chips */}
          {
            (activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || activeYearFilter) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-secondary">Filtered by:</span>

                {/* Tag Filters */}
                {activeTagFilters.map(tag => (
                  <button
                    key={`tag-${tag}`}
                    onClick={() => removeTagFilter(tag)}
                    className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-sm flex items-center gap-2 hover:bg-indigo-500/30 transition-colors"
                  >
                    {tag}
                    <span className="text-indigo-400">×</span>
                  </button>
                ))}

                {/* Author Filters */}
                {activeAuthorFilters.map(author => (
                  <button
                    key={`author-${author}`}
                    onClick={() => removeAuthorFilter(author)}
                    className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-sm flex items-center gap-2 hover:bg-emerald-500/30 transition-colors"
                  >
                    <span className="text-[10px] uppercase opacity-70">Author:</span> {author}
                    <span className="text-emerald-400">×</span>
                  </button>
                ))}

                {/* Year Filter */}
                {activeYearFilter && (
                  <button
                    onClick={() => setActiveYearFilter(null)}
                    className="px-3 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full text-sm flex items-center gap-2 hover:bg-cyan-500/30 transition-colors"
                  >
                    <span className="text-[10px] uppercase opacity-70">Year:</span> {activeYearFilter}
                    <span className="text-cyan-400">×</span>
                  </button>
                )}

                <button
                  onClick={clearAllFilters}
                  className="text-sm text-secondary hover:text-white underline"
                >
                  Clear all
                </button>
              </div>
            )
          }

          {/* Bulk Export Section */}
          {
            (activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || activeYearFilter) && (
              <div className="flex items-center gap-3 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="text-secondary text-sm font-medium whitespace-nowrap">
                  Export {filteredBooks.length} books to:
                </div>
                <input
                  type="text"
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  placeholder="C:\Folder\Path"
                  className="flex-1 bg-surface-light border border-white/10 rounded px-3 py-1 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
                <button
                  onClick={handleExport}
                  disabled={isExporting || !exportPath}
                  className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isExporting ? 'EXPORTING...' : 'CONFIRM EXPORT'}
                </button>
              </div>
            )
          }

          {isProcessingContent && <div className="text-xs font-mono text-cyan-500/70 max-w-md truncate">AI Data Scan: {taggingStats.current}</div>}
          {/* Book List */}
          <div className="bg-surface border border-white/5 rounded-2xl overflow-visible">
            <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-white/5 text-secondary font-medium">
                <tr>
                  <th className="px-4 py-3 cursor-pointer hover:text-white transition-colors group" style={{ width: '30%' }} onClick={() => requestSort('title')}>
                    Title {sortConfig.key === 'title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-white transition-colors group" style={{ width: '10%' }} onClick={() => requestSort('author')}>
                    Author {sortConfig.key === 'author' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3" style={{ width: '35%' }}>Tags</th>
                  <th className="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-white transition-colors group" style={{ width: '5%' }} onClick={() => requestSort('publication_year')}>
                    Year {sortConfig.key === 'publication_year' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white transition-colors group" style={{ width: '20%' }} onClick={() => requestSort('filepath')}>
                    File {sortConfig.key === 'filepath' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedBooks.map((book) => (
                  <tr
                    key={book.id}
                    className="hover:bg-white/5 transition-colors"
                    onMouseEnter={() => setHoveredRow(book.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td className="px-4 py-2 font-medium text-white">
                      <div className="relative group inline-block flex items-center gap-2">
                        {editingCell?.id === book.id && editingCell?.field === 'title' ? (
                          <input
                            autoFocus
                            defaultValue={book.title}
                            className="bg-neutral-800 border border-indigo-500 rounded px-2 py-1 text-white text-sm w-full min-w-[300px]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleManualUpdate(book.id, 'title', e.target.value);
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            onBlur={(e) => handleManualUpdate(book.id, 'title', e.target.value)}
                          />
                        ) : (
                          <>
                            <span
                              className={`cursor-help border-b border-white/10 group-hover:border-primary/50 transition-colors ${book.summary ? 'border-dotted' : ''}`}
                            >
                              {book.title || <span className="text-neutral-500 italic">Unknown Title</span>}
                            </span>

                            {/* Edit Icon */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ id: book.id, field: 'title' });
                              }}
                              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white transition-opacity px-1"
                              title="Edit Title"
                            >
                              ✎
                            </button>
                          </>
                        )}

                        {/* Property Sync Button */}
                        {!editingCell && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMetadataSync(book.id, book.filepath);
                            }}
                            disabled={syncingMetadataId !== null}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer border ${syncingMetadataId === book.id
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                              : 'opacity-0 group-hover:opacity-100 bg-white/5 text-secondary border-white/10 hover:bg-white/10 hover:text-white'
                              } disabled:opacity-50`}
                            title="Reread properties (Title, Author, Year) from file"
                          >
                            {syncingMetadataId === book.id ? 'SYNCING...' : 'SYNC PROP'}
                          </button>
                        )}

                        {/* Continuous Rescan Button */}
                        {!editingCell && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSingleScan(book.id, book.filepath);
                            }}
                            disabled={scanningBookId !== null}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer border ${scanningBookId === book.id
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 animate-pulse'
                              : (book.tags || book.master_tags)
                                ? 'opacity-0 group-hover:opacity-100 bg-neutral-500/10 text-neutral-400 border-neutral-500/20 hover:bg-neutral-500/20'
                                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                              } disabled:opacity-50`}
                            title={(book.tags || book.master_tags) ? "Regenerate AI tags and summary" : "Analyze book with AI"}
                          >
                            {scanningBookId === book.id
                              ? 'SCANNING...'
                              : (book.tags || book.master_tags) ? 'RESCAN' : 'SCAN AI'}
                          </button>
                        )}

                        {book.summary ? (
                          <div className="absolute z-50 hidden group-hover:block bg-surface/95 border border-white/10 p-4 rounded-xl shadow-2xl w-80 bottom-full left-0 mb-1 pointer-events-none backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="text-[10px] text-primary uppercase tracking-[0.2em] mb-2 font-bold">AI Summary</div>
                            <p className="text-sm leading-relaxed text-neutral-300 font-normal">{book.summary}</p>
                            <div className="absolute top-full left-4 border-8 border-transparent border-t-surface/95"></div>
                          </div>
                        ) : (
                          <div className="absolute z-50 hidden group-hover:block bg-surface/95 border border-amber-500/20 p-4 rounded-xl shadow-2xl w-80 bottom-full left-0 mb-1 pointer-events-none group-hover:pointer-events-auto backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="text-[10px] text-amber-500 uppercase tracking-[0.2em] mb-2 font-bold flex justify-between items-center">
                              <span>No AI Insight</span>
                              {scanningBookId === book.id && <span className="animate-pulse text-cyan-400">Scanning...</span>}
                            </div>
                            <p className="text-sm leading-relaxed text-neutral-400 font-normal italic mb-3">
                              No AI summary or tags generated yet.
                            </p>
                            <div className="absolute top-full left-4 border-8 border-transparent border-t-surface/95"></div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap overflow-hidden truncate" style={{ maxWidth: 0 }} title={book.author}>
                      <div className="relative group flex items-center gap-2">
                        {editingCell?.id === book.id && editingCell?.field === 'author' ? (
                          <input
                            autoFocus
                            defaultValue={book.author}
                            className="bg-neutral-800 border border-indigo-500 rounded px-2 py-1 text-white text-sm w-full"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleManualUpdate(book.id, 'author', e.target.value);
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            onBlur={(e) => handleManualUpdate(book.id, 'author', e.target.value)}
                          />
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1 items-center">
                              {book.author ? parseAuthors(book.author).map((author, i) => {
                                const isActive = activeAuthorFilters.includes(author);
                                return (
                                  <button
                                    key={i}
                                    onClick={() => handleAuthorClick(author)}
                                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${isActive
                                      ? 'bg-emerald-500/30 text-emerald-200 border-emerald-500/50'
                                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30'
                                      }`}
                                  >
                                    {author}
                                  </button>
                                );
                              }) : <span className="text-neutral-600">-</span>}

                              <button
                                onClick={() => setEditingCell({ id: book.id, field: 'author' })}
                                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white transition-opacity px-1"
                                title="Edit Author"
                              >
                                ✎
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {/* Categories Rendering */}
                        {book.master_tags && book.master_tags.split(',').map((tag, i) => {
                          const trimmedTag = tag.trim();
                          const isActive = activeTagFilters.includes(trimmedTag);
                          return (
                            <button
                              key={`master-${i}`}
                              onClick={() => handleTagClick(trimmedTag)}
                              className={`px-2 py-0.5 border rounded-full text-[10px] tracking-wider transition-all cursor-pointer ${isActive
                                ? 'bg-orange-500/30 text-orange-200 border-orange-500/50'
                                : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20'
                                }`}
                            >
                              {trimmedTag}
                            </button>
                          );
                        })}

                        {/* Normal Tags Rendering */}
                        {book.tags ? book.tags.split(',').map((tag, i) => {
                          const trimmedTag = tag.trim();
                          const isActive = activeTagFilters.includes(trimmedTag);
                          return (
                            <button
                              key={i}
                              onClick={() => handleTagClick(trimmedTag)}
                              className={`px-2 py-0.5 border rounded-full text-[10px] tracking-wider transition-all cursor-pointer ${isActive
                                ? 'bg-indigo-500/30 text-indigo-300 border-indigo-500/50'
                                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
                                }`}
                            >
                              {trimmedTag}
                            </button>
                          );
                        }) : !book.master_tags && <span className="text-neutral-700 italic text-xs">No tags</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
                      <div className="relative group flex items-center gap-2">
                        {editingCell?.id === book.id && editingCell?.field === 'publication_year' ? (
                          <input
                            autoFocus
                            defaultValue={book.publication_year}
                            type="text"
                            pattern="\d*"
                            className="bg-neutral-800 border border-indigo-500 rounded px-2 py-1 text-white text-sm w-20 text-center"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleManualUpdate(book.id, 'publication_year', parseInt(e.target.value) || null);
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            onBlur={(e) => handleManualUpdate(book.id, 'publication_year', parseInt(e.target.value) || null)}
                          />
                        ) : (
                          <>
                            {book.publication_year ? (
                              <button
                                onClick={() => setActiveYearFilter(book.publication_year)}
                                className={`hover:text-cyan-300 hover:underline transition-colors ${activeYearFilter === book.publication_year ? 'text-cyan-400 font-bold underline' : ''}`}
                                title="Filter by this Year"
                              >
                                {book.publication_year}
                              </button>
                            ) : '-'}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ id: book.id, field: 'publication_year' });
                              }}
                              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white transition-opacity px-1"
                              title="Edit Year"
                            >
                              ✎
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-mono text-[11px] break-words relative group">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/open-folder', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filepath: book.filepath })
                              });
                              const data = await response.json();
                              if (!response.ok) {
                                alert(`Failed to open folder: ${data.error || 'Unknown error'}`);
                              }
                            } catch (error) {
                              alert(`Error: ${error.message}`);
                            }
                          }}
                          className="hover:text-indigo-400 underline cursor-pointer text-left"
                          title={book.filepath}
                        >
                          {book.filepath.split(/[\\/]/).pop()}
                        </button>
                        <button
                          onClick={() => copyToClipboard(book.filepath)}
                          className="ml-auto flex-shrink-0 px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] text-secondary hover:text-white transition-all opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                          title="Copy full path"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredBooks.length === 0 && books.length > 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                      No books match the selected filters.
                      <button onClick={clearAllFilters} className="ml-2 text-indigo-400 hover:text-indigo-300 underline">
                        Clear filters
                      </button>
                    </td>
                  </tr>
                )}
                {books.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                      No books found. Scan a directory to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {
              totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-secondary">
                      Showing {startIndex + 1}-{Math.min(endIndex, filteredBooks.length)} of {filteredBooks.length} books
                    </span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      className="px-3 py-1 bg-white/10 border border-white/20 rounded text-sm text-white"
                    >
                      <option value={100}>100 per page</option>
                      <option value={500}>500 per page</option>
                      <option value={1000}>1000 per page</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-secondary">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )
            }
          </div >
        </main >
      </div >
    </div >
  )
}

export default App
