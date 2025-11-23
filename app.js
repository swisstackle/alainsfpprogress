const EXERCISES = [
  {key:'broad_jump', label:'Broad Jump', units:'m'},
  {key:'vertical_jump', label:'Vertical Jump', units:'m'},
  {key:'sprint_top_speed', label:'Sprint Top Speed', units:'m/s'},
  {key:'max_throw_velocity', label:'Max Throwing Velocity', units:'m/s'}
];

function parseCSVThen(callback){
  Papa.parse('data.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: results => callback(results.data)
  });
}

function groupByExercise(rows){
  const out = {};
  EXERCISES.forEach(e=>out[e.key]=[]);
  rows.forEach(r=>{
    const ex = r.exercise?.trim();
    if(!ex || !out[ex]) return;
    const ts = r.ts || r.date || r.timestamp;
    const value = parseFloat(r.value);
    const youtubeId = r.youtubeId || r.youtubeID || r.youtube || '';
    if(!isNaN(value) && ts) out[ex].push({ts, value, youtubeId});
  });
  // sort
  for(const k in out) out[k].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  return out;
}

function render(){
  parseCSVThen(rows=>{
    const grouped = groupByExercise(rows);
    EXERCISES.forEach(ex=>{
      const data = grouped[ex.key] || [];
      const labels = data.map(d=>d.ts);
      const values = data.map(d=>d.value);

      const ctx = document.getElementById('chart-'+ex.key).getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {labels, datasets:[{label: ex.label + ' ('+ex.units+')', data: values, borderColor:'#1473e6', backgroundColor:'rgba(20,115,230,0.08)', tension:0.15, pointRadius:4}]},
        options: {
          responsive:true,
          maintainAspectRatio:false,
          scales: {
            x: { // use category axis (labels) to avoid external date adapter requirements
              display: true,
              title: {display:false}
            },
            y: {display:true}
          },
          plugins: {legend:{display:true}}
        }
      });

      // set latest video if present
      const last = [...data].reverse().find(d=>d.youtubeId);
      const iframe = document.getElementById('video-'+ex.key);
      if(last && last.youtubeId){
        iframe.src = `https://www.youtube.com/embed/${last.youtubeId}`;
      } else {
        iframe.src = '';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', render);
