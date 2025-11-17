import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import UploadPage from './pages/UploadPage'
import PdfPage from './pages/PdfPage'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<UploadPage />} />
        </Route>
        <Route path="/pdf/:id" element={<PdfPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
