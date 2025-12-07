require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const Papa = require('papaparse');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname);

app.use(express.static(PUBLIC));

// Simple in-memory cache to reduce Google fetches
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 60 * 1000; // 1 minute default
let cached = { ts: 0, data: null };
// Separate cache for DATA_SOURCE_URL CSV text
let csvCache = { ts: 0, text: null };

function fetchText(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const getter = u.protocol === 'https:' ? https.get : http.get;
    const req = getter(u, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        resolve(fetchText(res.headers.location, timeout));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function listPublicDriveFolder(folderId) {
  const apiKey = process.env.GDRIVE_API_KEY;
  if (!apiKey) {
    throw new Error('GDRIVE_API_KEY not set — Drive API listing required');
  }

  const files = [];
  let pageToken = null;
  // Query: files that have the folder as parent and are not trashed
  const q = `'${folderId}'+in+parents+and+trashed=false`;
  do {
    const url = `https://www.googleapis.com/drive/v3/files?pageSize=1000&q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType)&key=${apiKey}` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const body = await fetchText(url);
    const json = JSON.parse(body);
    const batch = (json.files || []).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
    files.push(...batch);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return files;
}

async function fetchCsvExportForFileId(fileId) {
  // Try the spreadsheet CSV export URL for gid=0 first.
  // If the file is not a spreadsheet or gid=0 doesn't exist, attempt to fetch the file's "export?format=csv" as a fallback.
  const exportCsvUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=0`;
  try {
    const csv = await fetchText(exportCsvUrl);
    return csv;
  } catch (err) {
    // fallback - attempt Drive file export URL pattern
    const alt = `https://drive.google.com/uc?export=download&id=${fileId}`;
    try {
      const data = await fetchText(alt);
      return data;
    } catch (e) {
      throw err;
    }
  }
}

async function fetchDataSourceCsv() {
  const dataUrl = process.env.DATA_SOURCE_URL;
  if (!dataUrl) throw new Error('DATA_SOURCE_URL not set');
  const now = Date.now();
  if (csvCache.text && (now - csvCache.ts) < CACHE_TTL_MS) return csvCache.text;
  const text = await fetchText(dataUrl);
  csvCache = { ts: now, text };
  return text;
}

app.get('/data.csv', async (req, res) => {
  try {
    const csv = await fetchDataSourceCsv();
    res.set('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    console.error('Failed to fetch DATA_SOURCE_URL csv', err.message || err);
    res.status(502).json({ error: 'failed to fetch data source' });
  }
});

async function buildExercisesFromDrive(folderId) {
  const entries = await listPublicDriveFolder(folderId);
  const exercises = [];
  for (const e of entries) {
    try {
      const csvText = await fetchCsvExportForFileId(e.id);
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const rows = parsed.data || [];
      let label = null, units = null;
      for (const r of rows) {
        if (r.label && r.label.trim()) label = label || r.label.trim();
        if (r.units && r.units.trim()) units = units || r.units.trim();
        if (label && units) break;
      }
      const key = e.name ? e.name.replace(/\s+/g, '_').toLowerCase() : e.id;
      exercises.push({ key, file: `${e.id}.csv`, url: `https://docs.google.com/spreadsheets/d/${e.id}/export?format=csv&gid=0`, label: label || null, units: units || null });
    } catch (err) {
      console.warn(`Skipping file ${e.id} - failed to fetch/parse:`, err.message || err);
    }
  }
  return exercises;
}

async function buildExercisesFromLocal() {
  const files = await fs.promises.readdir(PUBLIC);
  const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
  const exercises = [];
  for (const file of csvFiles) {
    try {
      const key = path.basename(file, '.csv');
      const content = await fs.promises.readFile(path.join(PUBLIC, file), 'utf8');
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      const rows = parsed.data || [];
      let label = null, units = null;
      for (const r of rows) {
        if (r.label && r.label.trim()) label = label || r.label.trim();
        if (r.units && r.units.trim()) units = units || r.units.trim();
        if (label && units) break;
      }
      exercises.push({ key, file, url: `/${file}`, label: label || null, units: units || null });
    } catch (err) {
      console.warn(`Skipping local file ${file}:`, err.message || err);
    }
  }
  return exercises;
}

app.get('/api/exercises', async (req, res) => {
  try {
    const now = Date.now();
    if (cached.data && (now - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const dataSourceUrl = process.env.DATA_SOURCE_URL;
    let exercises = [];
    if (dataSourceUrl) {
      try {
        const csvText = await fetchDataSourceCsv();
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        const rows = parsed.data || [];
        // Group rows by exercise
        const groups = new Map();
        for (const r of rows) {
          const key = (r.exercise || '').trim();
          if (!key) continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        }
        for (const [key, groupRows] of groups.entries()) {
          // extract label/units from groupRows
          let label = null, units = null;
          for (const r of groupRows) {
            if (r.label && r.label.trim()) label = label || r.label.trim();
            if (r.units && r.units.trim()) units = units || r.units.trim();
            if (label && units) break;
          }
          exercises.push({ key, file: '/data.csv', url: dataSourceUrl, label: label || null, units: units || null });
        }
      } catch (err) {
        console.error('Failed to build manifest from DATA_SOURCE_URL, falling back to local CSVs', err);
        exercises = await buildExercisesFromLocal();
      }
    } else {
      // No DATA_SOURCE_URL configured: use local CSV files only
      exercises = await buildExercisesFromLocal();
    }

    // update cache
    cached = { ts: now, data: exercises };
    res.json(exercises);
  } catch (err) {
    console.error('Failed to build exercises.json', err);
    res.status(500).json({ error: 'failed to list exercises' });
  }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
