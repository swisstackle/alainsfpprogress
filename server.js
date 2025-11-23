const express = require('express');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname);

app.use(express.static(PUBLIC));

app.get('/api/exercises', async (req, res) => {
  try {
    const files = await fs.promises.readdir(PUBLIC);
    const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
    const exercises = [];
    for (const file of csvFiles) {
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
    }
    res.json(exercises);
  } catch (err) {
    console.error('Failed to build exercises.json', err);
    res.status(500).json({ error: 'failed to list exercises' });
  }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
