import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import PdfViewer from '../components/PdfViewer'
import MatchList from '../components/MatchList'

export default function PdfPage(){
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [matches, setMatches] = useState([])
  const viewerRef = useRef()
  const [pdfUrl, setPdfUrl] = useState(null)

  const API = import.meta.env.VITE_API_URL;

  useEffect(()=>{
    async function loadMeta(){
      const res = await fetch(`${API}/pdf-url/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setPdfUrl(data.url)
    }
    loadMeta()
  },[id])

  async function runSearch(q){
    if (!q) { 
      setMatches([]); 
      setSearchParams({}); 
      return 
    }
    
    setQuery(q)
    setSearchParams({ q })

    const res = await fetch(`${API}/search/${id}?q=${encodeURIComponent(q)}`)
    const json = await res.json()
    const results = json.results || []

    setMatches(results)

    setTimeout(()=>{
      if (results[0]) viewerRef.current?.highlight(results[0])
    }, 300)
  }

  useEffect(()=>{ 
    if (query) runSearch(query) 
  }, []) // run on load if q present

  return (
    <div style={{display:'flex', gap:12}}>
      <div style={{flex:1}}>
        <div style={{marginBottom:8}} className="searchbar">
          <input 
            value={query} 
            onChange={e=>setQuery(e.target.value)} 
            placeholder="Fuzzy search..." 
          />
          <button onClick={()=>runSearch(query)}>Search</button>
          <button onClick={()=>{ setQuery(''); runSearch('') }}>Clear</button>
        </div>

        <div className="viewer">
          {pdfUrl 
            ? <PdfViewer ref={viewerRef} pdfUrl={pdfUrl} /> 
            : <div>Loading PDF...</div>}
        </div>
      </div>

      <div className="matches">
        <h3>Matches</h3>
        <MatchList 
          matches={matches} 
          onClick={(m)=>viewerRef.current?.highlight(m)} 
        />
      </div>
    </div>
  )
}
