// Exercise discovery: support optional `exercises.json` manifest or per-exercise CSV files.
// If neither manifest nor per-exercise CSVs exist, we fall back to `data.csv` (single file) grouping.

// Defaults used when metadata is missing
const DEFAULT_UNITS = '';

// Helper: fetch and parse a CSV URL, return Promise that resolves to rows array or null on failure
function parseCSV(url){
  return new Promise((resolve)=>{
    Papa.parse(url + '?cb=' + Date.now(), {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: results => resolve(results.data),
      error: err => { console.warn('CSV parse error', url, err); resolve(null); }
    });
  });
}

async function fetchServerManifest(){
  try{
    const res = await fetch('/api/exercises', {cache: 'no-store'});
    if(!res.ok) return null;
    return await res.json();
  }catch(e){
    return null;
  }
}

function parseCSVThen(url, callback){
  // cache-bust the CSV request to always fetch fresh data
  Papa.parse(url + '?cb=' + Date.now(), {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: results => callback(results.data)
  });
}
function groupByExercise(rows){
  const out = {};
  rows.forEach(r=>{
    const ex = r.exercise?.trim();
    if(!ex) return;
    if(!out[ex]) out[ex]=[];
    const ts = r.ts || r.date || r.timestamp;
    const value = parseFloat(r.value);
    const youtubeId = r.youtubeId || r.youtubeID || r.youtube || '';
    if(!isNaN(value) && ts) out[ex].push({ts, value, youtubeId});
  });
  // sort
  for(const k in out) out[k].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  return out;
}

function ensureSectionForExercise(key, meta){
  const existing = document.querySelector(`section.exercise[data-exercise="${key}"]`);
  if(existing) return existing;
  const grid = document.querySelector('main.grid');
  const section = document.createElement('section');
  section.className = 'exercise';
  section.setAttribute('data-exercise', key);

  const h2 = document.createElement('h2');
  h2.textContent = meta?.label || key.replace(/_/g,' ');
  section.appendChild(h2);

  const card = document.createElement('div');
  card.className = 'card';

  const canvas = document.createElement('canvas');
  canvas.id = `chart-${key}`;
  canvas.setAttribute('aria-label', `${meta?.label||key} progress chart`);
  canvas.setAttribute('role','img');
  card.appendChild(canvas);

  const videoWrap = document.createElement('div');
  videoWrap.className = 'video-wrap';
  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.textContent = 'Latest video';
  videoWrap.appendChild(caption);
  const iframe = document.createElement('iframe');
  iframe.id = `video-${key}`;
  iframe.src = '';
  iframe.title = (meta?.label || key)+' video';
  iframe.setAttribute('frameborder','0');
  iframe.setAttribute('allowfullscreen','');
  videoWrap.appendChild(iframe);

  card.appendChild(videoWrap);
  section.appendChild(card);
  grid.appendChild(section);
  return section;
}

async function render(){
  // Prefer server manifest (Node server lists CSVs and extracts metadata). If not available,
  // fall back to existing DOM `section.exercise[data-exercise]` keys.
  const manifest = await fetchServerManifest();
  let keysAndMeta = null;
  if(manifest && Array.isArray(manifest) && manifest.length){
    keysAndMeta = manifest.map(m=>({key: m.key, meta: {label: m.label, units: m.units}, file: m.file}));
  } else {
    const existingKeys = Array.from(document.querySelectorAll('section.exercise')).map(s=>({key: s.getAttribute('data-exercise')}));
    if(existingKeys.length === 0){
      console.error('No exercise sections found and no server manifest available. Add sections or run the Node server.');
      return;
    }
    keysAndMeta = existingKeys.map(k=>({key: k.key, meta: null, file: k.key + '.csv'}));
  }

  await Promise.all(keysAndMeta.map(async item=>{
    const key = item.key;
    const file = item.file || (key + '.csv');
    const perRows = await parseCSV(file);
    let useGrouped = {};
    if(perRows && perRows.length){
      useGrouped = groupByExercise(perRows);
    } else {
      useGrouped[key] = [];
    }

    // Determine metadata priority: server manifest -> per-CSV label/units -> DOM header -> fallback
    const meta = {label: null, units: null};
    if(item.meta){ meta.label = item.meta.label; meta.units = item.meta.units; }
    if(!meta.label || !meta.units){
      function extractMetaFromRows(rs){
        if(!rs) return;
        for(const r of rs){
          if(r.label && r.label.trim()) meta.label = meta.label || r.label.trim();
          if(r.units && r.units.trim()) meta.units = meta.units || r.units.trim();
          if(meta.label && meta.units) break;
        }
      }
      extractMetaFromRows(perRows);
    }
    const domLabel = document.querySelector(`section.exercise[data-exercise="${key}"] h2`)?.textContent;
    const finalMeta = {label: meta.label || domLabel || key.replace(/_/g,' '), units: meta.units || DEFAULT_UNITS};
    ensureSectionForExercise(key, finalMeta);
    renderExerciseFromGrouped(key, useGrouped, finalMeta);
  }));
}

function renderExerciseFromGrouped(key, grouped, meta){
  const data = grouped[key] || [];
  const labels = data.map(d=>d.ts);
  const values = data.map(d=>d.value);

  const canvas = document.getElementById('chart-'+key);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {labels, datasets:[{label: (meta?.label||key) + (meta?.units? ' ('+meta.units+')':''), data: values, borderColor:'#1473e6', backgroundColor:'rgba(20,115,230,0.08)', tension:0.15, pointRadius:4}]},
    options: {
      responsive:true,
      maintainAspectRatio:false,
      scales: {
        x: { display: true, title: {display:false} },
        y: { display:true }
      },
      plugins: {legend:{display:true}}
    }
  });

  // set latest video if present
  const last = [...data].reverse().find(d=>d.youtubeId);
  const iframe = document.getElementById('video-'+key);
  if(iframe){
    if(last && last.youtubeId){
      iframe.src = `https://www.youtube.com/embed/${last.youtubeId}`;
    } else {
      iframe.src = '';
    }
  }
}

document.addEventListener('DOMContentLoaded', render);
