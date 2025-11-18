/**
 * server/index.js
 * Corrected version – using:
 * Bucket name: "PDFs"
 * Table name: "pdfs"
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const Fuse = require('fuse.js');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Ensure temp folder exists
if (!fs.existsSync('tmp_uploads')) fs.mkdirSync('tmp_uploads');

const upload = multer({ dest: 'tmp_uploads/' });

// Supabase service-client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase config in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * POST /api/upload
 * Saves PDF → Supabase Storage → extracts text → stores metadata in table "pdfs"
 */
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const localPath = req.file.path;
    const originalName = req.file.originalname;

    const pdfId = uuidv4();
    const storagePath = `files/${pdfId}_${originalName}`; // inside PDFs bucket

    const fileBuffer = fs.readFileSync(localPath);

    // Upload to Supabase Storage (bucket: PDFs)
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('PDFs')
      .upload(storagePath, fileBuffer, {
        upsert: false,
        contentType: "application/pdf"
      });

    if (uploadErr) {
      console.error('❌ Supabase storage upload error:', uploadErr);
      fs.unlinkSync(localPath);
      return res.status(500).json({ error: 'Failed to upload to storage' });
    }

    // Extract text per page
    const parsed = await pdfParse(fileBuffer);
    const perPage = (parsed.text || '').split('\f').map(p => p.trim());

    const pages = perPage.map((text, idx) => ({
      page: idx + 1,
      text: text || ''
    }));

    // Insert metadata → table "pdfs"
    const { data: insertData, error: insertErr } = await supabase
      .from('pdfs')
      .insert([{
        id: pdfId,
        filename: originalName,
        storage_path: storagePath,
        pages: pages,
        original_size: req.file.size
      }]);

    fs.unlinkSync(localPath);

    if (insertErr) {
      console.error('❌ Supabase insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to save metadata' });
    }

    return res.json({
      id: pdfId,
      filename: originalName,
      viewUrl: `/pdf/${pdfId}`
    });

  } catch (err) {
    console.error('❌ Upload error:', err);
    // Ensure cleanup in case of failure after upload but before insert
    if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/meta/:id
 * Fetch metadata from table "pdfs"
 */
app.get('/api/meta/:id', async (req, res) => {
  const id = req.params.id;

  const { data, error } = await supabase
    .from('pdfs')
    .select('id, filename, storage_path, original_size, created_at')
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: 'Not found' });

  res.json(data);
});

/**
 * GET /api/pdf-url/:id
 * Returns public URL of PDF stored in bucket "PDFs"
 */
app.get('/api/pdf-url/:id', async (req, res) => {
  const id = req.params.id;

  const { data, error } = await supabase
    .from('pdfs')
    .select('storage_path')
    .eq('id', id)
    .single();

  if (error || !data)
    return res.status(404).json({ error: 'Not found' });

  const { publicUrl } = supabase.storage
    .from('PDFs')
    .getPublicUrl(data.storage_path).data;

  return res.json({ url: publicUrl });
});

/**
 * GET /api/search/:id?q=
 * Fuzzy search over stored pages
 */
app.get('/api/search/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const q = req.query.q || '';

    if (!q) return res.json({ results: [] });

    const { data, error } = await supabase
      .from('pdfs')
      .select('pages')
      .eq('id', id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });

    const pages = data.pages || [];

    const fuse = new Fuse(pages, {
      keys: ['text'],
      includeMatches: true,
      includeScore: true,
      threshold: 0.3,
      distance: 100,
      minMatchCharLength: 2,
      ignoreLocation: false,
    });

    const fuseRes = fuse.search(q);

    const mapped = fuseRes.map(r => {
      const matchRanges = r.matches?.[0]?.indices || [];
      const itemText = r.item.text || '';
      let snippet = q;

      if (matchRanges.length > 0) {
        const [start, end] = matchRanges[0];
        const pad = 40;
        const s = Math.max(0, start - pad);
        const e = Math.min(itemText.length - 1, end + pad);
        snippet = itemText.substring(s, e + 1).replace(/\s+/g, ' ').trim();
      } else {
        const idx = itemText.toLowerCase().indexOf(q.toLowerCase());
        if (idx !== -1) {
          const pad = 40;
          const s = Math.max(0, idx - pad);
          const e = Math.min(itemText.length - 1, idx + q.length + pad);
          snippet = itemText.substring(s, e + 1).replace(/\s+/g, ' ').trim();
        }
      }

      return {
        page: r.item.page,
        text: snippet,
        needle: q,
        score: r.score,
      };
    });

    const results = mapped
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, 10);

    res.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);