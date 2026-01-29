import { useState, useEffect } from 'react'

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
  const [books, setBooks] = useState([])

  // Phase 1 UI improvements
  const [scanSectionCollapsed, setScanSectionCollapsed] = useState(() => {
    const saved = localStorage.getItem('scanCollapsed')
    return saved === 'true'
  })
  const [activeTagFilters, setActiveTagFilters] = useState([])
  const [activeAuthorFilters, setActiveAuthorFilters] = useState([])
  const [hoveredRow, setHoveredRow] = useState(null)
  const [scanningBookId, setScanningBookId] = useState(null)
  const [syncingMetadataId, setSyncingMetadataId] = useState(null)
  const [editingCell, setEditingCell] = useState(null) // { id: 1, field: 'title' }
  const [isSyncingTaxonomy, setIsSyncingTaxonomy] = useState(false)
  const [exportPath, setExportPath] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [taxonomyStats, setTaxonomyStats] = useState({ state: 'idle', current: 0, total: 0, message: '' })

  const fetchBooks = async () => {
    try {
      const res = await fetch('/api/books')
      const data = await res.json()
      setBooks(data)
    } catch (e) {
      console.error("Failed to fetch books", e)
    }
  }

  useEffect(() => {
    fetchBooks()
  }, [])

  const startScan = async () => {
    if (!path) return
    setIsScanning(true)
    setStats({ found: 0, added: 0, skipped: 0, currentFile: 'Starting...' })

    try {
      const response = await fetch('http://localhost:3001/api/scan', {
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
    setIsProcessingContent(true)
    try {
      const response = await fetch('http://localhost:3001/api/books/process-content', {
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
      const response = await fetch('http://localhost:3001/api/scan-master-tags', {
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
              setTaxonomyStats({ state: 'learning', current: 0, total: 0, message: 'Learning existing taxonomy...' })
            } else if (data.type === 'progress_learning') {
              setTaxonomyStats({
                state: 'learning',
                current: data.current,
                total: data.total,
                message: `Learning batch ${data.current}/${data.total}`
              })
            } else if (data.type === 'phase_applying') {
              setTaxonomyStats({ state: 'applying', current: 0, total: 0, message: 'Applying tags to books...' })
            } else if (data.type === 'progress_applying') {
              setTaxonomyStats({
                state: 'applying',
                current: data.current,
                total: data.total,
                message: `Applying ${data.current}/${data.total}`
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

    return matchesTags && matchesAuthors
  })

  // Auto-collapse scan section after successful scan
  useEffect(() => {
    if (!isScanning && stats.added > 0 && books.length > 0) {
      setScanSectionCollapsed(true)
      localStorage.setItem('scanCollapsed', 'true')
    }
  }, [isScanning, stats.added, books.length])

  return (
    <div className="min-h-screen bg-background text-neutral-100 font-sans selection:bg-primary/30">
      <div className="max-w-7xl mx-auto px-6 py-12">
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
                  {books.length > 0 && (
                    <span className="text-sm text-secondary">
                      {books.length} books in library
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
          <div className="sticky top-0 z-10 bg-background pb-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  Library ({filteredBooks.length}{(activeTagFilters.length > 0 || activeAuthorFilters.length > 0) && ` of ${books.length}`})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={startTagGeneration}
                    disabled={isProcessingMetadata || isProcessingContent || isSyncingTaxonomy || books.length === 0}
                    className={`px-6 py-2 rounded-lg font-medium border border-cyan-500/20 bg-cyan-950/20 text-cyan-400 hover:bg-cyan-500/10 ${isProcessingContent ? 'bg-neutral-800' : ''}`}
                  >
                    {isProcessingContent ? `AI Data Scan: ${taggingStats.processed}/${taggingStats.total}` : 'AI Data Scan'}
                  </button>
                  <button
                    onClick={handleSyncTaxonomy}
                    disabled={isProcessingMetadata || isProcessingContent || isSyncingTaxonomy || books.length === 0}
                    className={`relative px-6 py-2 rounded-lg font-medium border border-amber-500/20 bg-amber-950/20 text-amber-400 hover:bg-amber-500/10 ${isSyncingTaxonomy ? 'bg-neutral-800' : ''} ${books.some(b => b.tags && !b.master_tags) ? 'animate-pulse ring-1 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : ''}`}
                    title="AI groups your tags into categories"
                  >
                    {isSyncingTaxonomy
                      ? (taxonomyStats.message || 'Syncing...')
                      : 'Rescan Categories'}
                    {!isSyncingTaxonomy && books.some(b => b.tags && !b.master_tags) && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Active Filter Chips */}
              {(activeTagFilters.length > 0 || activeAuthorFilters.length > 0) && (
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

                  <button
                    onClick={clearAllFilters}
                    className="text-sm text-secondary hover:text-white underline"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {/* Bulk Export Section */}
              {(activeTagFilters.length > 0 || activeAuthorFilters.length > 0) && (
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
              )}

              {isProcessingContent && <div className="text-xs font-mono text-cyan-500/70 max-w-md truncate">AI Data Scan: {taggingStats.current}</div>}
            </div>
          </div>

          {/* Book List */}
          <div className="bg-surface border border-white/5 rounded-2xl overflow-visible">
            <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-white/5 text-secondary font-medium">
                <tr>
                  <th className="px-4 py-3" style={{ width: '30%' }}>Title</th>
                  <th className="px-4 py-3 whitespace-nowrap" style={{ width: '10%' }}>Author</th>
                  <th className="px-4 py-3" style={{ width: '35%' }}>Tags</th>
                  <th className="px-4 py-3 whitespace-nowrap" style={{ width: '5%' }}>Year</th>
                  <th className="px-4 py-3" style={{ width: '20%' }}>File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredBooks.map((book) => (
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
                      {book.publication_year || '-'}
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
          </div>
        </main>
      </div >
    </div >
  )
}

export default App
