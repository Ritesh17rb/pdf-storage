import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function UploadPage(){
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const API = import.meta.env.VITE_API_URL;

  async function handleUpload(e){
    e.preventDefault()
    if (!file) return alert('Select a PDF')
    setLoading(true)

    const fd = new FormData()
    fd.append('pdf', file)

    try {
      const res = await fetch(`${API}/upload`, {
        method:'POST',
        body: fd
      })

      const data = await res.json()
      setLoading(false)

      if (data.id) {
        navigate(`/pdf/${data.id}`)
      } else {
        alert('Upload failed')
      }
    } catch(err){
      setLoading(false)
      console.error(err)
      alert('Upload error')
    }
  }

  return (
    <div className="upload-card">
      <h2>Upload PDF</h2>
      <form onSubmit={handleUpload}>
        <input 
          type="file" 
          accept="application/pdf" 
          onChange={e=>setFile(e.target.files?.[0])} 
        />
        <div style={{marginTop:12}}>
          <button type="submit" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload & Open'}
          </button>
        </div>
      </form>
    </div>
  )
}
