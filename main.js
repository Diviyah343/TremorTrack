/* main.js - Tremor capture, analysis, storage, and charts */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation (only buttons with data-target are page links)
  document.querySelectorAll('nav button[data-target]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.target, btn));
  });

  // Theme toggle: apply persisted theme or system preference and wire the toggle
  const themeToggle = document.getElementById('themeToggle');
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    try{ localStorage.setItem('theme', theme); }catch(e){}
    if (themeToggle){
      themeToggle.setAttribute('aria-pressed', theme === 'dark');
      const icon = document.getElementById('themeIcon');
      if (icon) icon.src = theme === 'dark' ? 'images/theme-dark.svg' : 'images/theme-light.svg';
      themeToggle.setAttribute('title', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#071022' : '#ffffff');
  }

  let savedTheme = null;
  try{ savedTheme = localStorage.getItem('theme'); }catch(e){}
  if (!savedTheme){ savedTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; }
  applyTheme(savedTheme);

  if (themeToggle){
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // Elements
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const status = document.getElementById('status');
  const resultBox = document.getElementById('result');
  const resDuration = document.getElementById('resDuration');
  const resAmp = document.getElementById('resAmp');
  const resFreq = document.getElementById('resFreq');
  const resDetect = document.getElementById('resDetect');
  const saveCurrentBtn = document.getElementById('saveCurrentBtn');
  const simulateBtn = document.getElementById('simulateBtn');
  // Trace elements
  const traceCanvas = document.getElementById('traceCanvas');
  const startTraceBtn = document.getElementById('startTraceBtn');
  const clearTraceBtn = document.getElementById('clearTraceBtn');
  const submitTraceBtn = document.getElementById('submitTraceBtn');
  const traceStatus = document.getElementById('traceStatus');
  const resTraceAcc = document.getElementById('resTraceAcc');
  const resTraceSeverity = document.getElementById('resTraceSeverity');
  const summaryBox = document.getElementById('summaryBox');

  let tracing = false;
  let tracePoints = [];
  let spiralPath = [];
  let traceCtx = traceCanvas.getContext('2d');
  let traceHasStroke = false;

  // Document page
  const sessionsList = document.getElementById('sessionsList');
  const attachResult = document.getElementById('attachResult');
  const docForm = document.getElementById('docForm');
  const docsList = document.getElementById('docsList');
  const autoDocPreview = document.getElementById('autoDocPreview');
  const discardAutoBtn = document.getElementById('discardAuto');

  // handle discard auto draft
  discardAutoBtn.addEventListener('click', ()=>{
    if (!currentResult) return;
    removeAutoDraftForResult(currentResult.id);
    refreshDocsUI();
    autoDocPreview.classList.add('hidden');
    alert('Auto draft discarded');
  });

  // Visualize
  const ampCanvas = document.getElementById('ampChart');
  const freqCanvas = document.getElementById('freqChart');
  const addSampleData = document.getElementById('addSampleData');
  const clearDataBtn = document.getElementById('clearData');

  let recording = false;
  let samples = [];
  let timestamps = [];
  let motionHandler = null;
  let currentResult = null;

  if (startBtn) startBtn.addEventListener('click', startCapture);
  if (stopBtn) stopBtn.addEventListener('click', stopCapture);
  if (simulateBtn) simulateBtn.addEventListener('click', simulateSample);
  if (saveCurrentBtn) saveCurrentBtn.addEventListener('click', saveCurrentResult);
  addSampleData.addEventListener('click', addSampleDataset);
  clearDataBtn.addEventListener('click', clearAllData);
  docForm.addEventListener('submit', saveDocument);

 
 
  // Trace listeners
  startTraceBtn.addEventListener('click', () => {
    if (traceStatus) traceStatus.textContent = 'Trace started — follow the swirl';
    traceHasStroke = false; tracePoints = []; submitTraceBtn.disabled = true; drawingEnable(true);
    generateSpiral(); drawSpiral();
  });
  clearTraceBtn.addEventListener('click', () => { clearTraceCanvas(); generateSpiral(); drawSpiral(); if (traceStatus) traceStatus.textContent='Cleared'; traceHasStroke=false; submitTraceBtn.disabled=true; });
  submitTraceBtn.addEventListener('click', () => { if (!traceHasStroke) return alert('Please draw the swirl first'); evaluateTrace(); });

 
 
  // Test tab switching
  document.querySelectorAll('.test-tab').forEach(tb => tb.addEventListener('click', (ev)=>{
    const t = ev.currentTarget.dataset.test;
    document.querySelectorAll('.test-tab').forEach(x=>x.classList.remove('active'));
    ev.currentTarget.classList.add('active');
    
    // New behavior: instead of hiding other tests, scroll the selected test into view
    const view = document.getElementById('test-' + t);
    if (view) {
      view.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      // Give it a subtle flash so the user sees the selection
      view.classList.add('flash'); setTimeout(()=> view.classList.remove('flash'), 700);
    }
    if (t === 'trace') { generateSpiral(); drawSpiral(); }
    if (t === 'linetrace') { generateLine(); drawLineGuide(); }
  }));

 
 
  // Pointer events on canvas
  traceCanvas.addEventListener('pointerdown', (e) => { if (!startTraceBtn) return; if (startTraceBtn.disabled) {};
    if (e.button !== 0) return; // left click only
    traceCanvas.setPointerCapture(e.pointerId);
    tracing = true; traceHasStroke=true; submitTraceBtn.disabled=false; tracePoints.push(pointFromEvent(e)); drawLinePoint(e);
  });

  
  
  // Finger tapping test
  const tapLeft = document.getElementById('tapLeft');
  const tapRight = document.getElementById('tapRight');
  const startTapping = document.getElementById('startTapping');
  const stopTapping = document.getElementById('stopTapping');
  const tappingTimer = document.getElementById('tappingTimer');
  const tappingResults = document.getElementById('tappingResults');
  let tappingActive = false; let tappingTaps = []; let tappingWrong=0; let expectedSide = 'L'; let tappingTimerInterval = null; let tappingTimeout = null;

  function computeStd(arr){ if (arr.length<=1) return 0; const m = arr.reduce((s,v)=>s+v,0)/arr.length; return Math.sqrt(arr.reduce((s,v)=>(s+(v-m)*(v-m)),0)/arr.length); }

  function updateTapHighlight(){ if (!tapLeft || !tapRight) return; tapLeft.classList.toggle('active', expectedSide==='L'); tapRight.classList.toggle('active', expectedSide==='R'); }

  function finishTapping(){ tappingActive=false; startTapping.disabled=false; stopTapping.disabled=true; tapLeft.disabled = true; tapRight.disabled = true; tappingTimer.textContent='Done';
    if (tappingTimerInterval) clearInterval(tappingTimerInterval); if (tappingTimeout) clearTimeout(tappingTimeout);
    
    // compute metrics using only correct taps
    const correctTaps = tappingTaps.filter(t=>t.correct);
    if (correctTaps.length===0) { tappingResults.textContent=`No valid alternated taps recorded (wrong taps: ${tappingWrong})`; summaryBox.innerHTML = `Tapping: no valid data`; return; }
    const totalTime = (correctTaps[correctTaps.length-1].t - correctTaps[0].t)/1000 || 1;
    const tapsPerSec = correctTaps.length / totalTime;
    const intervals = []; for (let i=1;i<correctTaps.length;i++){ intervals.push((correctTaps[i].t - correctTaps[i-1].t)/1000); }
    const std = computeStd(intervals);
    
    // speed decay: compare taps/sec first half vs second half
    const mid = Math.floor(correctTaps.length/2); const firstRate = mid>0 ? (mid / ((correctTaps[mid-1].t - correctTaps[0].t)/1000)) : tapsPerSec; const secondRate = (correctTaps.length-mid)>0 ? ((correctTaps.length-mid) / ((correctTaps[correctTaps.length-1].t - correctTaps[mid].t)/1000)) : tapsPerSec;
    const decay = Math.round((firstRate - secondRate) * 100)/100;
    tappingResults.innerHTML = `<strong>Taps/sec:</strong> ${tapsPerSec.toFixed(2)} • <strong>Std (s):</strong> ${std.toFixed(3)} • <strong>Decay:</strong> ${decay} • <strong>Wrong taps:</strong> ${tappingWrong}`;
    
    // attach to currentResult
    currentResult = currentResult || { id:'r_'+Date.now(), date:new Date().toISOString() };
    currentResult.tapping = { taps: correctTaps.length, tapsPerSec, std, decay, wrong:tappingWrong, timestamps: correctTaps };
    // summary fields for charts
    currentResult.avgAmplitude = Math.min(1, std / 0.5);
    currentResult.dominantFreq = tapsPerSec;
    summaryBox.innerHTML = `Tapping: ${tapsPerSec.toFixed(2)} t/s, irregularity ${std.toFixed(3)}, decay ${decay}`;
    createAutoDoc(currentResult); prefillDocumentForm(currentResult); refreshDocsUI();
    // Preview on charts
    previewResultOnCharts(currentResult);
  }

  startTapping && startTapping.addEventListener('click', ()=>{
    tappingActive=true; tappingTaps=[]; tappingWrong=0; expectedSide='L'; updateTapHighlight(); tappingTimer.textContent='15s left'; startTapping.disabled=true; stopTapping.disabled=false;
    tapLeft.disabled = false; tapRight.disabled = false;
    const start = Date.now();
    tappingTimerInterval = setInterval(()=>{
      const elapsed = Math.floor((Date.now()-start)/1000);
      const left = Math.max(0,15-elapsed); tappingTimer.textContent = `${left}s left`;
      if (left<=0){ if (tappingTimerInterval) clearInterval(tappingTimerInterval); finishTapping(); }
    },200);
    tappingTimeout = setTimeout(()=>{ finishTapping(); }, 15000);
  });

  stopTapping && stopTapping.addEventListener('click', ()=>{ if (!tappingActive) return; if (tappingTimerInterval) clearInterval(tappingTimerInterval); if (tappingTimeout) clearTimeout(tappingTimeout); finishTapping(); });

  // tap handlers
  tapLeft && tapLeft.addEventListener('pointerdown', (e)=>{ if (!tappingActive) return; const now = Date.now(); if (expectedSide === 'L'){ tappingTaps.push({side:'L', t:now, correct:true}); expectedSide='R'; updateTapHighlight(); } else { tappingTaps.push({side:'L', t:now, correct:false}); tappingWrong++; /* small visual feedback */ tapLeft.classList.add('shake'); setTimeout(()=>tapLeft.classList.remove('shake'),220); } });
  tapRight && tapRight.addEventListener('pointerdown', (e)=>{ if (!tappingActive) return; const now = Date.now(); if (expectedSide === 'R'){ tappingTaps.push({side:'R', t:now, correct:true}); expectedSide='L'; updateTapHighlight(); } else { tappingTaps.push({side:'R', t:now, correct:false}); tappingWrong++; tapRight.classList.add('shake'); setTimeout(()=>tapRight.classList.remove('shake'),220); } });
  traceCanvas.addEventListener('pointermove', (e) => { if (!tracing) return; tracePoints.push(pointFromEvent(e)); drawLinePoint(e); });
  traceCanvas.addEventListener('pointerup', (e) => { tracing=false; traceCanvas.releasePointerCapture(e.pointerId); });
  traceCanvas.addEventListener('pointercancel', () => { tracing=false; });

  // Helpers for drawing and spiral
  function drawingEnable(enable){ traceCanvas.style.touchAction = enable ? 'none' : 'auto'; }
  function pointFromEvent(e){ const r=traceCanvas.getBoundingClientRect(); return { x: (e.clientX-r.left)*(traceCanvas.width/r.width), y: (e.clientY-r.top)*(traceCanvas.height/r.height), t: Date.now() }; }

  // Hold-still test
  const holdDot = document.getElementById('holdDot');
  const holdStatus = document.getElementById('holdStatus');
  const holdResults = document.getElementById('holdResults');
  let holdActive=false; let holdSamples=[]; let holdTimer=null;
  function startHold(){ if (!holdDot) return; holdActive=true; holdSamples=[]; holdStatus.textContent='Holding...';
    const startTime = Date.now();
    holdTimer = setTimeout(()=> stopHold(), 15000);
    
    // sample at 40Hz
    const r = holdDot.getBoundingClientRect(); const center = { x: r.left + r.width/2, y: r.top + r.height/2 };
    const sam = setInterval(()=>{ if (!holdActive) { clearInterval(sam); return; } const now = Date.now(); const pos = lastPointerPos || center; const dx = pos.x - center.x, dy = pos.y - center.y; holdSamples.push({t:now, dx, dy, mag: Math.hypot(dx,dy)}); }, 25);
    
    // temporarily guide pointer capture on holdDot
  }
  function stopHold(){ holdActive=false; if (holdTimer) clearTimeout(holdTimer); holdStatus.textContent='Done';
    if (holdSamples.length===0){ holdResults.textContent='No hold samples'; return; }
    const meanDrift = holdSamples.reduce((s,v)=>s+v.mag,0)/holdSamples.length;
    
    // compute dominant tremor frequency from magnitude series
    const mags = holdSamples.map(s=>s.mag); const times = holdSamples.map(s=>s.t);
    const {dominantFreq} = computeDominantFrequency(mags, times);
    const stability = Math.max(0, 100 - Math.round(meanDrift*40));
    holdResults.innerHTML = `<strong>Drift:</strong> ${meanDrift.toFixed(2)} px • <strong>Freq:</strong> ${dominantFreq.toFixed(2)} Hz • <strong>Stability:</strong> ${stability}`;
    currentResult = currentResult || { id:'r_'+Date.now(), date:new Date().toISOString() };
    currentResult.hold = { meanDrift, dominantFreq, stability, samples: holdSamples };
    // summary fields for charts
    currentResult.avgAmplitude = Math.min(1, meanDrift / 50);
    currentResult.dominantFreq = dominantFreq;

    summaryBox.innerHTML = `Hold: drift ${meanDrift.toFixed(2)} px, ${dominantFreq.toFixed(2)} Hz, stability ${stability}`;
    createAutoDoc(currentResult); prefillDocumentForm(currentResult); refreshDocsUI();
    // Preview on charts
    previewResultOnCharts(currentResult);
  }
  // track last pointer pos globally for hold sampling
  let lastPointerPos = null; document.addEventListener('pointermove', (e)=>{ lastPointerPos = { x:e.clientX, y:e.clientY }; });
  // pointer on dot
  holdDot && holdDot.addEventListener('pointerdown', (e)=>{ e.preventDefault(); startHold(); }); holdDot && holdDot.addEventListener('pointerup', ()=>{ if (holdActive) stopHold(); });
  function drawLinePoint(e){ const p = pointFromEvent(e); traceCtx.strokeStyle = '#2d6cdf'; traceCtx.lineWidth = 4; traceCtx.lineCap = 'round'; traceCtx.lineJoin = 'round'; if (!traceCtx._last){ traceCtx.beginPath(); traceCtx.moveTo(p.x,p.y); traceCtx._last = p; } else { traceCtx.lineTo(p.x,p.y); traceCtx.stroke(); traceCtx._last = p; } }
  function clearTraceCanvas(){ traceCtx.clearRect(0,0,traceCanvas.width,traceCanvas.height); traceCtx._last = null; }

  function generateSpiral(){ // create an Archimedean spiral centered in canvas
    spiralPath = [];
    const cx = traceCanvas.width/2, cy = traceCanvas.height/2; const maxR = Math.min(cx,cy)-20;
    const turns = 3.5; const points = 520; for (let i=0;i<points;i++){ const t = i/(points-1); const theta = t * Math.PI * 2 * turns; const r = (t)*maxR; const x = cx + r*Math.cos(theta); const y = cy + r*Math.sin(theta); spiralPath.push({x,y}); }
  }

  function drawSpiral(){ // low opacity guide
    clearTraceCanvas(); traceCtx.save(); traceCtx.globalAlpha = 0.22; traceCtx.strokeStyle = '#2d6cdf'; traceCtx.lineWidth = 6; traceCtx.beginPath(); for (let i=0;i<spiralPath.length;i++){ const p=spiralPath[i]; if (i===0) traceCtx.moveTo(p.x,p.y); else traceCtx.lineTo(p.x,p.y); } traceCtx.stroke(); traceCtx.restore(); traceCtx._last = null; }

  // Line tracing canvas
  const lineCanvas = document.getElementById('lineCanvas'); const lineCtx = lineCanvas && lineCanvas.getContext('2d'); const startLine = document.getElementById('startLine'); const clearLine = document.getElementById('clearLine'); const submitLine = document.getElementById('submitLine'); const lineResults = document.getElementById('lineResults'); let linePath = []; let linePoints = []; let lineDrawing=false; // attach start/clear/submit
  startLine && startLine.addEventListener('click', ()=>{ linePoints=[]; clearLineCanvas(); generateLine(); drawLineGuide(); startLine.disabled=true; submitLine.disabled=false; });
  clearLine && clearLine.addEventListener('click', ()=>{ linePoints=[]; clearLineCanvas(); generateLine(); drawLineGuide(); submitLine.disabled=true; });
  submitLine && submitLine.addEventListener('click', ()=>{ if (!linePoints || linePoints.length<5) return alert('Please draw along the line'); evaluateLine(); submitLine.disabled=true; startLine.disabled=false; });
  function generateLine(){ linePath = []; const h = lineCanvas.height; const w = lineCanvas.width; // center sine-ish path
    for (let i=0;i<w;i+=4){ const t = i / w; const y = h/2 + Math.sin(t * Math.PI * 2) * (h*0.12); linePath.push({x:i, y}); }
    drawLineGuide(); }
  function drawLineGuide(){ if(!lineCtx) return; lineCtx.clearRect(0,0,lineCanvas.width,lineCanvas.height); lineCtx.save(); lineCtx.globalAlpha = 0.2; lineCtx.strokeStyle = '#2d6cdf'; lineCtx.lineWidth = 6; lineCtx.beginPath(); for(let i=0;i<linePath.length;i++){ const p=linePath[i]; if (i===0) lineCtx.moveTo(p.x,p.y); else lineCtx.lineTo(p.x,p.y);} lineCtx.stroke(); lineCtx.restore(); }
  function clearLineCanvas(){ if(!lineCtx) return; lineCtx.clearRect(0,0,lineCanvas.width,lineCanvas.height); }
  // line pointer
  lineCanvas && lineCanvas.addEventListener('pointerdown', (e)=>{ lineCanvas.setPointerCapture(e.pointerId); lineDrawing=true; linePoints=[pointFromLineEvent(e)]; drawLineStroke(e, true); });
  lineCanvas && lineCanvas.addEventListener('pointermove', (e)=>{ if(!lineDrawing) return; linePoints.push(pointFromLineEvent(e)); drawLineStroke(e); });
  lineCanvas && lineCanvas.addEventListener('pointerup', (e)=>{ lineDrawing=false; evaluateLine(); });
  function pointFromLineEvent(e){ const r=lineCanvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*(lineCanvas.width/r.width), y:(e.clientY-r.top)*(lineCanvas.height/r.height), t:Date.now() }; }
  function drawLineStroke(e, start){ if(!lineCtx) return; const p=pointFromLineEvent(e); lineCtx.strokeStyle='#2d6cdf'; lineCtx.lineWidth=4; lineCtx.lineCap='round'; if (start){ lineCtx.beginPath(); lineCtx.moveTo(p.x,p.y); lineCtx._last = p;} else { lineCtx.lineTo(p.x,p.y); lineCtx.stroke(); lineCtx._last=p; } }
  function evaluateLine(){ if (linePoints.length<5) return alert('Please draw along the line'); let sum=0; for (let i=0;i<linePoints.length;i++){ const q=linePoints[i]; // find nearest path point
    let best=Infinity; for (let j=0;j<linePath.length;j++){ const p=linePath[j]; const d=Math.hypot(p.x-q.x,p.y-q.y); if (d<best) best=d; } sum+=best; }
    const meanDev = sum/linePoints.length; // smoothness: compute angle change variability
    let angles=[]; for (let k=2;k<linePoints.length;k++){ const p1=linePoints[k-2], p2=linePoints[k-1], p3=linePoints[k]; const a1=Math.atan2(p2.y-p1.y,p2.x-p1.x); const a2=Math.atan2(p3.y-p2.y,p3.x-p2.x); let da = Math.abs(a2-a1); if (da>Math.PI) da = Math.abs(2*Math.PI - da); angles.push(da); }
    const smooth = computeStd(angles);
    // overcorrections: count sign changes in angle derivative
    let signChanges=0; for (let i=1;i<angles.length;i++){ if ((angles[i]-angles[i-1]) * (angles[i-1]-angles[i-2] || 0) < 0) signChanges++; }
    lineResults.innerHTML = `<strong>Mean deviation:</strong> ${meanDev.toFixed(2)} px • <strong>Smoothness:</strong> ${smooth.toFixed(3)} • <strong>Overcorrections:</strong> ${signChanges}`;
    currentResult = currentResult || { id:'r_'+Date.now(), date:new Date().toISOString() };
    currentResult.line = { meanDev, smooth, signChanges, points:linePoints };
    summaryBox.innerHTML = `Line: deviation ${meanDev.toFixed(2)} px, smooth ${smooth.toFixed(3)}`;
    createAutoDoc(currentResult); prefillDocumentForm(currentResult); refreshDocsUI(); }



  function evaluateTrace(){
    if (tracePoints.length === 0) return alert('No drawing found');
    const MIN_POINTS = 30;
    const MATCH_RADIUS = Math.max(12, Math.min(traceCanvas.width, traceCanvas.height) * 0.06); // px

    // For each spiral point, compute nearest drawn point distance
    const matched = new Array(spiralPath.length).fill(Infinity);
    for (let i = 0; i < spiralPath.length; i++){
      const p = spiralPath[i];
      for (let j = 0; j < tracePoints.length; j++){
        const q = tracePoints[j];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < matched[i]) matched[i] = d;
      }
    }

    // Coverage = fraction of spiral points with at least one drawn point within MATCH_RADIUS
    let coveredCount = 0; let coveredDistSum = 0; for (let i=0;i<matched.length;i++){ if (matched[i] <= MATCH_RADIUS){ coveredCount++; coveredDistSum += matched[i]; } }
    const coverage = coveredCount / spiralPath.length;
    const meanMatchedDist = coveredCount > 0 ? (coveredDistSum / coveredCount) : (MATCH_RADIUS * 2);
    const normalizedDistance = Math.min(1, meanMatchedDist / MATCH_RADIUS);

    // Combine coverage and distance into a single accuracy score
    const coverageWeight = 0.7; const distanceWeight = 0.3;
    let rawScore = (coverage * coverageWeight) + ((1 - normalizedDistance) * distanceWeight);

    // Penalize very short / sparse strokes (likely a dot)
    if (tracePoints.length < MIN_POINTS){ const factor = (tracePoints.length / MIN_POINTS) * 0.5; rawScore *= factor; }
    const accuracy = Math.max(0, Math.min(1, rawScore));
    const accPct = Math.round(accuracy * 100);
    const severityScore = Math.round((1 - accuracy) * 100);
    let severityLabel = 'Low'; if (severityScore > 60) severityLabel = 'High'; else if (severityScore > 30) severityLabel = 'Medium';

    // Visual feedback: redraw spiral then mark covered points
    drawSpiral();
    traceCtx.save();
    traceCtx.fillStyle = 'rgba(34,197,94,0.12)';
    traceCtx.strokeStyle = 'rgba(34,197,94,0.9)';
    for (let i=0;i<matched.length;i++){ if (matched[i] <= MATCH_RADIUS){ const p = spiralPath[i]; traceCtx.beginPath(); traceCtx.arc(p.x,p.y,4,0,Math.PI*2); traceCtx.fill(); } }
    traceCtx.restore();

    // show results
    if (resTraceAcc) resTraceAcc.textContent = `${accPct}%`;
    if (resTraceSeverity) resTraceSeverity.textContent = `${severityLabel} (${severityScore})`;
    if (traceStatus) traceStatus.textContent = `Accuracy ${accPct}% • Severity ${severityLabel}`;

    // derive tremor detection from severity
    const tremorFromTrace = severityScore > 60;
    if (resDetect) resDetect.textContent = tremorFromTrace ? 'Likely' : (severityScore > 30 ? 'Possible' : 'Not Clear');

    // attach to currentResult (create if needed)
    if (!currentResult || !currentResult.id){ currentResult = { id:'r_' + Date.now(), date: new Date().toISOString(), duration:0, avgAmplitude:null, dominantFreq:null, power:0, tremorDetected:tremorFromTrace, samples:[], timestamps:[] }; }
    currentResult.trace = { accuracy, accPct, severityScore, severityLabel, meanMatchedDist, coverage, points:tracePoints };
    currentResult.tremorDetected = tremorFromTrace;
    // Set summary fields for charts (estimate amplitude from meanMatchedDist)
    currentResult.avgAmplitude = Math.min(1, (meanMatchedDist || 0) / 100);
    if (typeof currentResult.dominantFreq !== 'number') currentResult.dominantFreq = currentResult.dominantFreq || 0;

    // Auto-generate document and pre-fill
    createAutoDoc(currentResult);
    prefillDocumentForm(currentResult);
    refreshDocsUI();
    // Preview on charts (transient)
    previewResultOnCharts(currentResult);

    // show result area
    resultBox.classList.remove('hidden');
  }

  // Charts
  let ampChart = new Chart(ampCanvas, {
    type: 'bar', data: { labels: [], datasets: [{ label: 'Avg amplitude', data: [], backgroundColor: 'rgba(6,182,212,0.72)' }] }, options: { responsive: true }
  });
  let freqChart = new Chart(freqCanvas, {
    type: 'bar', data: { labels: [], datasets: [{ label: 'Dominant frequency (Hz)', data: [], backgroundColor: 'rgba(6,182,212,0.72)' }] }, options: { responsive: true }
  });

  // Initialization
  // Prepare the spiral and line guides so they are visible on first view
  generateSpiral(); drawSpiral(); generateLine(); drawLineGuide();
  // disable tapping zones until user starts
  if (document.getElementById('tapLeft')) document.getElementById('tapLeft').disabled = true; if (document.getElementById('tapRight')) document.getElementById('tapRight').disabled = true;
  refreshSessionsUI();
  updateAttachOptions();
  renderCharts();

  // Initialize interactive hero background
  initHeroBG();
  // Apply per-letter variable width to hero title
  applyVariableWidthTitle();

  // Interactive hero background (particle canvas responsive to cursor)
  function initHeroBG(){
    const canvas = document.getElementById('heroBg');
    console.debug && console.debug('initHeroBG: attempting to start');
    if (!canvas) { console.debug && console.debug('initHeroBG: no canvas found'); return; }
    if (canvas.dataset.inited === 'true') { console.debug && console.debug('initHeroBG: already inited'); return; } canvas.dataset.inited = 'true';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { console.debug && console.debug('initHeroBG: reduced-motion active — skipping'); return; } // respect accessibility

    const ctx = canvas.getContext('2d');
    let dpr = window.devicePixelRatio || 1; let w = 0, h = 0; let raf = null;
    let particles = [];
    const mouse = {x:-9999, y:-9999, active:false};
    let firstMouse = true;

    function resize(){
      w = canvas.clientWidth || Math.max(300, Math.round(canvas.offsetWidth)); h = canvas.clientHeight || Math.max(80, Math.round(canvas.offsetHeight));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      initParticles();
      console.debug && console.debug('initHeroBG resize', w, h, 'dpr', dpr);
      // One-time faint fill to visualize area (will be cleared by loop immediately)
      ctx.fillStyle = 'rgba(6,182,212,0.02)'; ctx.fillRect(0,0,w,h);
    }

    function initParticles(){
      particles = [];
      const area = Math.max(80000, w*h);
      const count = Math.min(120, Math.round(area / 60000));
      for (let i=0;i<count;i++){
        particles.push({ x: Math.random()*w, y: Math.random()*h, vx:(Math.random()-0.5)*0.8, vy:(Math.random()-0.5)*0.8, r: 1.2 + Math.random()*3, alpha: 0.5 + Math.random()*0.5 });
      }
      console.debug && console.debug('initHeroBG particles', particles.length);
    }

    function onMove(e){ const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true; if (firstMouse){ firstMouse=false; console.debug && console.debug('initHeroBG: mouse active', mouse.x, mouse.y); } }
    function onLeave(){ mouse.active = false; mouse.x = -9999; mouse.y = -9999; }

    canvas.addEventListener('mousemove', onMove, {passive:true});
    canvas.addEventListener('pointermove', onMove, {passive:true});
    canvas.addEventListener('mouseleave', onLeave);

    let visible = true;
    if ('IntersectionObserver' in window){
      const heroEl = document.querySelector('.hero-spotlight');
      const obs = new IntersectionObserver((entries)=>{ entries.forEach(en=>{ visible = en.isIntersecting; if (visible) start(); else stop(); }); }, {threshold: 0.05});
      obs.observe(heroEl);
    }

    function start(){ if (raf) return; loop(); }
    function stop(){ if (raf) { cancelAnimationFrame(raf); raf = null; } }

    function loop(){ ctx.clearRect(0,0,w,h);
      // update & draw particles
      for (let i=0;i<particles.length;i++){
        const p = particles[i];
        if (mouse.active){ const dx = mouse.x - p.x, dy = mouse.y - p.y; const dist = Math.hypot(dx,dy); if (dist < 180){ const f = (1 - dist/180); p.vx += (dx / (dist||1)) * 0.08 * f; p.vy += (dy / (dist||1)) * 0.08 * f; } }
        p.vx *= 0.94; p.vy *= 0.94; p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w+10; if (p.x > w+10) p.x = -10; if (p.y < -10) p.y = h+10; if (p.y > h+10) p.y = -10;
        // draw glow
        ctx.beginPath(); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*6); g.addColorStop(0, `rgba(6,182,212,${p.alpha})`); g.addColorStop(1, `rgba(6,182,212,0)`); ctx.fillStyle = g; ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      }
      // subtle lines
      for (let i=0;i<particles.length;i++){
        for (let j=i+1;j<particles.length;j++){ const a=particles[i], b=particles[j]; const dx=a.x-b.x, dy=a.y-b.y; const d2 = dx*dx+dy*dy; if (d2 < 14000){ const alpha = 0.14 * (1 - d2/14000); ctx.strokeStyle = `rgba(6,182,212,${alpha})`; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); } }
      }
      raf = requestAnimationFrame(loop);
    }

    // initial resize and start
    window.addEventListener('resize', ()=>{ resize(); });
    resize();
    start();
  }

  // Apply per-letter variable width to the hero title (idempotent)
  function applyVariableWidthTitle(){
    const el = document.querySelector('.hero-title');
    if (!el) return;
    if (el.dataset.vwInited === 'true') return; // already done
    el.dataset.vwInited = 'true';
    const text = (el.textContent || '').trim();
    // clear and rebuild with spans per character
    el.textContent = '';
    for (let i=0;i<text.length;i++){
      const ch = text[i];
      const span = document.createElement('span');
      span.className = 'hero-char';
      if (ch === ' '){ span.innerHTML = '&nbsp;'; span.style.display='inline-block'; span.style.width='0.42em'; span.style.setProperty('--w', 1); }
      else {
        // deterministic per-letter variation using sine for pleasant pattern
        const base = 0.98; const variance = 0.08; const val = base + Math.sin(i * 1.7) * variance;
        span.style.setProperty('--w', val.toFixed(3)); span.textContent = ch;
      }
      el.appendChild(span);
    }
  }

  // Carousel removed

  // Animate test views when they scroll into view
  (function setupViewAnimation(){
    const testViews = document.querySelectorAll('.test-view');
    if (testViews.length === 0) return;
    if ('IntersectionObserver' in window){
      const viewObserver = new IntersectionObserver((entries, obs)=>{
        entries.forEach(ent=>{ if (ent.isIntersecting){ ent.target.classList.add('animate-in'); obs.unobserve(ent.target); } });
      }, {threshold: 0.12});
      testViews.forEach(tv => { tv.classList.remove('animate-in'); viewObserver.observe(tv); });
    } else {
      testViews.forEach(tv => tv.classList.add('animate-in'));
    }
  })();

  // Navigation helper
  function navigate(target, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const pageEl = document.getElementById(target);
    pageEl.classList.remove('hidden');

    // show/hide the hero so it appears only on Home
    const heroEl = document.querySelector('.hero-spotlight');
    if (heroEl) {
      if (target === 'home') heroEl.classList.remove('hidden'); else heroEl.classList.add('hidden');
    }

    // trigger entrance animation each time page is shown
    pageEl.classList.remove('animate-in'); void pageEl.offsetWidth; pageEl.classList.add('animate-in');
    // scroll page into view for smooth navigation
    try { pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) { /* ignore on unsupported environments */ }
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (target === 'check') { generateSpiral(); drawSpiral(); }
  }

  // Allow any element with data-target to trigger navigation (e.g., hero buttons)
  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-target]');
    if (t) {
      const target = t.dataset.target;
      const navBtn = document.querySelector(`nav button[data-target="${target}"]`);
      if (navBtn) navBtn.click(); else navigate(target, null);
    }
  });

  // Robust handlers for hero CTA buttons: add visual press feedback, stronger logs, and forced fallback navigation
  (function attachHeroCTA(){
    const ctas = Array.from(document.querySelectorAll('.hero-spotlight-cta button[data-target]'));
    if (!ctas.length) return;
    ctas.forEach(btn => {
      if (!btn.getAttribute('type')) btn.setAttribute('type','button');

      function showPress() { btn.classList.add('cta-pressed'); setTimeout(()=> btn.classList.remove('cta-pressed'), 180); }

      btn.addEventListener('click', (e) => {
        console.log('Hero CTA click ->', btn.dataset.target);
        e.preventDefault();
        showPress();

        const target = btn.dataset.target;
        const navBtn = document.querySelector(`nav button[data-target="${target}"]`);

        // Try navigate() first
        try {
          navigate(target, navBtn);
          console.log('Called navigate() for', target);
        } catch (err) {
          console.warn('navigate() threw an error for', target, err);
        }

        // Explicit page reveal and scroll (force)
        const pageEl = document.getElementById(target);
        if (pageEl) {
          console.log('Found page element for', target, 'hidden?', pageEl.classList.contains('hidden'));
          document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
          pageEl.classList.remove('hidden');
          try { pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { console.warn('scrollIntoView failed', e); }
          try { pageEl.setAttribute('tabindex', '-1'); pageEl.focus({preventScroll:true}); } catch (e) {}
        } else {
          console.warn('No page element with id=', target);
        }

        // Update nav active state
        if (navBtn) { document.querySelectorAll('nav button').forEach(b => b.classList.remove('active')); navBtn.classList.add('active'); }

        // Hash fallback: set the hash after a short delay to avoid interfering with scroll
        try { setTimeout(()=> { if (!location.hash || location.hash.replace('#','') !== target) location.hash = '#' + target; }, 60); } catch (e) { console.warn('Failed to set hash', e); }

        // Final safety: if after 120ms the page is still hidden, un-hide it again (helps race conditions)
        setTimeout(()=>{
          const p = document.getElementById(target);
          if (p && p.classList.contains('hidden')){ console.warn('Fallback un-hiding page after timeout for', target); p.classList.remove('hidden'); try { p.scrollIntoView({behavior: 'smooth', block: 'start'}) } catch(e){} }
        }, 120);
      }, { passive: false });

      // also support keyboard activation
      btn.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
      });

      // pointerdown quick visual feedback
      btn.addEventListener('pointerdown', ()=> showPress(), { passive: true });
    });
  })();

  // scroll hint (click or keyboard) — scrolls to the #home card
  const scrollHintEl = document.querySelector('.scroll-hint');
  if (scrollHintEl){
    scrollHintEl.addEventListener('click', ()=>{
      const home = document.getElementById('home'); if (home) home.scrollIntoView({behavior:'smooth', block:'start'});
    });
    scrollHintEl.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollHintEl.click(); }});
  }

  // Target touch test (multi-target concurrent)
  const targetArea = document.getElementById('targetArea');
  const startTarget = document.getElementById('startTarget');
  const targetStatus = document.getElementById('targetStatus');
  const targetResults = document.getElementById('targetResults');
  let targetActive=false; 
  let targetTrials = 15; // total targets to spawn
  let targetsSpawned = 0; let hits = 0; let misses = 0; let reactionTimes = [];
  let _spawnTimers = []; let _finishTimer = null; let _activeTargets = new Map();

  function clearAllTargetTimers(){ _spawnTimers.forEach(id=>clearTimeout(id)); _spawnTimers=[]; if (_finishTimer) { clearTimeout(_finishTimer); _finishTimer=null; } for (const v of _activeTargets.values()){ if (v.timer) clearInterval(v.timer); if (v.expire) clearTimeout(v.expire); if (v.el) v.el.remove(); } _activeTargets.clear(); }

  function startTargetTest(){ if (targetActive) return; targetActive=true; targetsSpawned=0; hits=0; misses=0; reactionTimes=[]; targetResults.textContent=`Hits: 0 • Misses: 0`; targetStatus.textContent='Preparing...'; startTarget.disabled=true; clearAllTargetTimers();
    const sessionDuration = 20000; // spawn window (ms)
    const lifetime = 4000; // each target lasts 4s (user requirement)

    // schedule random spawn times across sessionDuration so targets appear at random times
    for (let i=0;i<targetTrials;i++){
      const t = Math.floor(Math.random()*(sessionDuration - 1000)); // ensure at least small offset before end
      const id = setTimeout(()=>{ spawnTimedTarget(lifetime); }, t);
      _spawnTimers.push(id);
    }

    // Finish test after sessionDuration + lifetime + small buffer
    _finishTimer = setTimeout(()=>{ // wait until all spawns likely finished
      // also wait for active targets to clear naturally
      const wait = setInterval(()=>{ if (_activeTargets.size===0){ clearInterval(wait); finishTargets(); } }, 200);
    }, sessionDuration + 200);
    targetStatus.textContent = `Running (0/${targetTrials})`;
  }

  function spawnTimedTarget(lifetime){ if (!targetArea) return; targetsSpawned++; const r = targetArea.getBoundingClientRect(); const s = 64; const x = Math.random()*(Math.max(0, r.width - s)); const y = Math.random()*(Math.max(0, r.height - s));
    const el = document.createElement('button'); el.className='target-dot'; el.style.left = x+'px'; el.style.top = y+'px'; el.innerHTML = `<span class="ttl">${Math.ceil(lifetime/1000)}</span>`; targetArea.appendChild(el);
    const spawnAt = Date.now(); const id = 't_' + spawnAt + '_' + Math.round(Math.random()*1000);
    targetStatus.textContent = `Running (${targetsSpawned}/${targetTrials})`;

    // per-target countdown updater
    const ttlSpan = el.querySelector('.ttl');
    let remaining = lifetime;
    const timer = setInterval(()=>{
      remaining -= 250; if (ttlSpan) ttlSpan.textContent = (Math.max(0, Math.ceil(remaining/1000)));
    },250);

    // expire handler
    const expire = setTimeout(()=>{ // missed
      if (_activeTargets.has(id)){
        misses++;
        if (el) el.remove();
        if (timer) clearInterval(timer);
        _activeTargets.delete(id);
        targetStatus.textContent = `Running (${targetsSpawned}/${targetTrials})`;
        targetResults.textContent = `Hits: ${hits} • Misses: ${misses}`;
      }
    }, lifetime);

    // click handler
    const onHit = (ev)=>{
      if (!targetActive) return; if (!_activeTargets.has(id)) return; // ignore if already expired or handled
      const rt = Date.now() - spawnAt; reactionTimes.push(rt); hits++;
      // cleanup
      if (timer) clearInterval(timer); if (expire) clearTimeout(expire);
      el.removeEventListener('pointerdown', onHit);
      if (el) el.remove();
      _activeTargets.delete(id);
      targetStatus.textContent = `Running (${targetsSpawned}/${targetTrials})`;
      targetResults.textContent = `Hits: ${hits} • Misses: ${misses}`;
    };
    el.addEventListener('pointerdown', onHit, { passive:true });

    _activeTargets.set(id, { el, timer, expire });
  }

  function finishTargets(){ targetActive=false; startTarget.disabled=false; targetStatus.textContent='Done';
    // clear timers
    clearAllTargetTimers();

    const mean = reactionTimes.length? (reactionTimes.reduce((s,v)=>s+v,0)/reactionTimes.length) : 0;
    const missRate = Math.round((misses/targetTrials)*100);
    targetResults.innerHTML = `<strong>Mean RT:</strong> ${mean.toFixed(0)} ms • <strong>Miss rate:</strong> ${missRate}% • <strong>Hits:</strong> ${hits}`;
    currentResult = currentResult || { id:'r_'+Date.now(), date:new Date().toISOString() };
    currentResult.target = { reactionTimes, misses, missRate, meanRT:mean, hits };
    // summary numeric fields
    currentResult.avgAmplitude = Math.min(1, missRate / 100);
    currentResult.dominantFreq = mean > 0 ? (1000 / mean) : 0; // mean RT -> approx frequency (Hz)
    summaryBox.innerHTML = `Target: ${Math.round(mean)} ms mean, ${missRate}% misses, ${hits} hits`;
    createAutoDoc(currentResult); prefillDocumentForm(currentResult); refreshDocsUI();
    // Preview on charts
    previewResultOnCharts(currentResult);
  }

  startTarget && startTarget.addEventListener('click', ()=>{ startTargetTest(); });
  // expose a cleanup if user navigates away
  window.addEventListener('beforeunload', ()=>{ clearAllTargetTimers(); });

  // Timed repetition test
  const repCanvas = document.getElementById('repCanvas'); const repCtx = repCanvas && repCanvas.getContext('2d'); const startRep = document.getElementById('startRep'); const stopRep = document.getElementById('stopRep'); const repResults = document.getElementById('repResults');
  let repActive=false; let repStrokes=[]; let repStrokePoints=[]; let repTimer=null;
  // Repetition targets
  let repTargets = []; // {cx,cy,r}

  function pointFromRepEvent(e){ if(!repCanvas) return {x:0,y:0,t:Date.now()}; const r=repCanvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*(repCanvas.width/r.width), y:(e.clientY-r.top)*(repCanvas.height/r.height), t:Date.now() }; }

  function generateRepTargets(n=5){ repTargets = []; if (!repCanvas) return; const w = repCanvas.width, h = repCanvas.height; let attempts=0; while(repTargets.length < n && attempts < n*8){ attempts++; const r = 30 + Math.round(Math.random()*50); const cx = r + Math.random()*(w - r*2); const cy = r + Math.random()*(h - r*2);
      // avoid heavy overlap
      let ok = true; for (const t of repTargets){ const d = Math.hypot(t.cx-cx, t.cy-cy); if (d < (t.r + r + 12)) { ok = false; break; } }
      if (ok) repTargets.push({cx,cy,r}); }
    // if still short, allow overlap by filling remaining with randoms
    while(repTargets.length < n){ const r = 30 + Math.round(Math.random()*50); const cx = r + Math.random()*(w - r*2); const cy = r + Math.random()*(h - r*2); repTargets.push({cx,cy,r}); }
  }

  function drawRepTargets(highlights){ // highlights: Map index -> accuracy (0-100) or 'miss'
    if (!repCtx) return; // clear background area
    repCtx.clearRect(0,0,repCanvas.width, repCanvas.height);
    // semi-transparent outlines
    repTargets.forEach((t, idx)=>{
      const acc = highlights && highlights.has && highlights.get && highlights.get(idx);
      if (acc === 'miss') { repCtx.strokeStyle = 'rgba(220,38,38,0.9)'; repCtx.lineWidth = 3; }
      else if (typeof acc === 'number') { repCtx.strokeStyle = 'rgba(34,197,94,0.9)'; repCtx.lineWidth = 3; }
      else { repCtx.strokeStyle = 'rgba(6,182,212,0.22)'; repCtx.lineWidth = 3; }
      repCtx.beginPath(); repCtx.arc(t.cx, t.cy, t.r, 0, Math.PI*2); repCtx.stroke();
      // small label
      repCtx.fillStyle = 'rgba(6,182,212,0.12)'; repCtx.fillRect(t.cx-16, t.cy-10, 32, 20);
      repCtx.fillStyle = 'rgba(6,182,212,0.9)'; repCtx.font = '12px ' + (document.body.style.fontFamily || 'sans-serif'); repCtx.textAlign = 'center'; repCtx.textBaseline = 'middle'; repCtx.fillText((idx+1).toString(), t.cx, t.cy);
    });
  }

  repCanvas && repCanvas.addEventListener('pointerdown', (e)=>{ if (!repActive) return; repCanvas.setPointerCapture(e.pointerId); repStrokePoints=[pointFromRepEvent(e)]; repCtx.beginPath(); repCtx.moveTo(repStrokePoints[0].x, repStrokePoints[0].y); repCtx._last = repStrokePoints[0]; });
  repCanvas && repCanvas.addEventListener('pointermove', (e)=>{ if (!repActive || !repStrokePoints) return; const p=pointFromRepEvent(e); repStrokePoints.push(p); repCtx.lineTo(p.x,p.y); repCtx.strokeStyle='#2d6cdf'; repCtx.lineWidth=4; repCtx.stroke(); });
  repCanvas && repCanvas.addEventListener('pointerup', (e)=>{ if (!repActive) return; if (repStrokePoints && repStrokePoints.length>8){ repStrokes.push(repStrokePoints.slice()); } repStrokePoints=null; });

  repCanvas && repCanvas.addEventListener('pointerup', (e)=>{ if (!repActive) return; if (repStrokePoints && repStrokePoints.length>8){ repStrokes.push(repStrokePoints.slice()); } repStrokePoints=null; });
  startRep && startRep.addEventListener('click', ()=>{ // generate visible target guides and run for 20s
    repActive=true; repStrokes=[]; startRep.disabled=true; stopRep.disabled=false; repResults.textContent='Running 20s';
    // generate 5 targets, draw them as semi-transparent outlines
    generateRepTargets(5); drawRepTargets();
    const start=Date.now(); repTimer=setTimeout(()=>{ stopRep && stopRep.click(); }, 20000);
  });
  stopRep && stopRep.addEventListener('click', ()=>{ repActive=false; startRep.disabled=false; stopRep.disabled=true; if (repTimer) clearTimeout(repTimer);
    if (repStrokes.length===0) { repResults.textContent='No circles drawn'; drawRepTargets(); return; }

    // Map strokes to targets and compute accuracy per target (0-100)
    const perTargetBest = new Map(); // idx -> bestAccuracy

    repStrokes.forEach((stroke) => {
      // compute stroke stats: average distance of points to each target center
      const scores = repTargets.map((t, idx) => {
        const ds = stroke.map(p => Math.hypot(p.x - t.cx, p.y - t.cy));
        const avgDist = ds.reduce((s,v)=>s+v,0)/ds.length;
        const meanAbsError = ds.map(d=>Math.abs(d - t.r)).reduce((s,v)=>s+v,0)/ds.length;
        const normalized = meanAbsError / (t.r || 1);
        const accuracy = Math.max(0, 1 - normalized) * 100; // clamp
        return { idx, accuracy, avgDist, meanAbsError };
      });
      // select target with minimal meanAbsError (or maximal accuracy)
      scores.sort((a,b)=> b.accuracy - a.accuracy);
      const best = scores[0];
      // keep the best accuracy per target (avoid double counting)
      const prev = perTargetBest.get(best.idx) || 0;
      if (best.accuracy > prev) perTargetBest.set(best.idx, best.accuracy);
    });

    // compute results
    const tracedTargets = Array.from(perTargetBest.keys()).length;
    const totalTargets = repTargets.length;
    const avgAccuracy = tracedTargets ? (Array.from(perTargetBest.values()).reduce((s,v)=>s+v,0)/tracedTargets) : 0;
    const missed = totalTargets - tracedTargets;

    // mark misses
    const highlights = new Map();
    for (let i=0;i<totalTargets;i++){
      if (perTargetBest.has(i)) highlights.set(i, Math.round(perTargetBest.get(i)));
      else highlights.set(i, 'miss');
    }
    drawRepTargets(highlights);

    repResults.innerHTML = `<strong>Accuracy:</strong> ${avgAccuracy.toFixed(1)}% • <strong>Targets:</strong> ${tracedTargets}/${totalTargets} • <strong>Missed:</strong> ${missed}`;

    currentResult = currentResult || { id:'r_'+Date.now(), date:new Date().toISOString() };
    currentResult.repetition = { repTargets, perTargetBest: Object.fromEntries(perTargetBest), avgAccuracy, tracedTargets };
    // set summary numeric fields
    currentResult.avgAmplitude = Math.min(1, 1 - (avgAccuracy / 100));
    currentResult.dominantFreq = currentResult.dominantFreq || 0;
    summaryBox.innerHTML = `Repetition: ${avgAccuracy.toFixed(1)}% accuracy, ${tracedTargets}/${totalTargets} targets`;
    createAutoDoc(currentResult); prefillDocumentForm(currentResult); refreshDocsUI();
    // Preview on charts
    previewResultOnCharts(currentResult);
  });

  // Capture
  async function startCapture() {
    samples = [];
    timestamps = [];
    recording = true;
    resultBox.classList.add('hidden');
    if (status) status.textContent = 'Starting...';
    if (startBtn) startBtn.disabled = true; if (stopBtn) stopBtn.disabled = false;

    // Request permission on iOS
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') {
          status.textContent = 'Motion permission denied. Use simulate.'; startBtn.disabled = false; stopBtn.disabled = true; return;
        }
      } catch (e) {
        // ignore
      }
    }

    motionHandler = (ev) => {
      const a = ev.acceleration || ev.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x||0)*(a.x||0) + (a.y||0)*(a.y||0) + (a.z||0)*(a.z||0));
      samples.push(mag);
      timestamps.push(Date.now());
      if (status) status.textContent = `Recording: ${samples.length} samples`;
    };

    window.addEventListener('devicemotion', motionHandler);

    // Auto-stop after 10s
    setTimeout(() => {
      if (recording) stopCapture();
    }, 10000);
  }

  function stopCapture() {
    if (!recording) return;
    recording = false;
    if (startBtn) startBtn.disabled = false; if (stopBtn) stopBtn.disabled = true;
    window.removeEventListener('devicemotion', motionHandler);
    if (status) status.textContent = 'Processing sample...';

    if (samples.length < 4) {
      if (status) status.textContent = 'Insufficient data. Try simulate or use a mobile device.';
      return;
    }

    analyzeSample(samples, timestamps);
  }

  function simulateSample() {
    // generate a 5Hz sine + noise over 8s at 60Hz
    samples = [];
    timestamps = [];
    const fs = 60; const duration = 8; const f = 5.0;
    for (let i=0;i<fs*duration;i++){
      const t=i/fs;
      const val = 0.6*Math.abs(Math.sin(2*Math.PI*f*t)) + (Math.random()-0.5)*0.05;
      samples.push(val);
      timestamps.push(Date.now() + i*(1000/fs));
    }
    analyzeSample(samples, timestamps);
  }

  function analyzeSample(samples, timestamps) {
    const durationSec = (timestamps[timestamps.length-1]-timestamps[0]) / 1000;
    const avgAmp = samples.reduce((s,v)=>s+v,0)/samples.length;
    const {dominantFreq, power} = computeDominantFrequency(samples, timestamps);
    const tremor = dominantFreq >= 3 && dominantFreq <= 7 && avgAmp > 0.05; // heuristic

    // show results
    if (resDuration) resDuration.textContent = durationSec.toFixed(2);
    if (resAmp) resAmp.textContent = avgAmp.toFixed(3);
    if (resFreq) resFreq.textContent = dominantFreq.toFixed(2);
    if (resDetect) resDetect.textContent = tremor ? 'Likely' : 'Not Clear';
    resultBox.classList.remove('hidden');
    if (status) status.textContent = 'Done';

    currentResult = {
      id: 'r_' + Date.now(),
      date: new Date().toISOString(),
      duration: durationSec,
      avgAmplitude: avgAmp,
      dominantFreq: dominantFreq,
      power: power,
      tremorDetected: tremor,
      samples: samples,
      timestamps: timestamps
    };

    // Auto-generate a document draft for this check and pre-fill the document form
    createAutoDoc(currentResult);
    prefillDocumentForm(currentResult);
    refreshDocsUI();
    updateAttachOptions();
  }

  // DFT (simple) to estimate dominant frequency
  function computeDominantFrequency(samples, timestamps) {
    const n = samples.length;
    // estimate sampling rate
    let dtSum = 0;
    for (let i=1;i<timestamps.length;i++) dtSum += (timestamps[i]-timestamps[i-1]);
    const dt = dtSum / (timestamps.length-1) / 1000; // seconds
    const fs = 1 / dt;
    // compute DFT magnitudes for k=1..n/2
    let maxPower = 0; let kMax = 0;
    for (let k=1;k<Math.floor(n/2);k++){
      let re=0, im=0;
      for (let j=0;j<n;j++){
        const angle = -2*Math.PI*k*j/n;
        re += samples[j]*Math.cos(angle);
        im += samples[j]*Math.sin(angle);
      }
      const power = Math.sqrt(re*re + im*im);
      if (power > maxPower) { maxPower = power; kMax = k; }
    }
    const freq = kMax * (fs / n);
    return { dominantFreq: freq || 0, power: maxPower };
  }

  // Save result
  // Ensure a result has numeric fields needed for charts (avgAmplitude, dominantFreq, duration)
  function normalizeResultForCharts(r){
    if (!r) return r;
    if (typeof r.duration !== 'number') r.duration = r.duration || 0;

    // avgAmplitude heuristics: pick a sensible metric from the tests
    if (r.avgAmplitude === null || r.avgAmplitude === undefined){
      if (r.hold && typeof r.hold.meanDrift === 'number') r.avgAmplitude = Math.min(1, r.hold.meanDrift / 50);
      else if (r.trace && typeof r.trace.meanMatchedDist === 'number') r.avgAmplitude = Math.min(1, r.trace.meanMatchedDist / 100);
      else if (r.repetition && typeof r.repetition.avgAccuracy === 'number') r.avgAmplitude = Math.min(1, 1 - (r.repetition.avgAccuracy / 100));
      else if (r.tapping && typeof r.tapping.std === 'number') r.avgAmplitude = Math.min(1, r.tapping.std / 0.5);
      else r.avgAmplitude = 0.05; // default small value
    }

    // dominantFreq heuristics
    if (r.dominantFreq === null || r.dominantFreq === undefined){
      if (r.hold && typeof r.hold.dominantFreq === 'number') r.dominantFreq = r.hold.dominantFreq;
      else r.dominantFreq = 0;
    }

    // coerce numeric types
    r.avgAmplitude = Number(r.avgAmplitude) || 0;
    r.dominantFreq = Number(r.dominantFreq) || 0;
    return r;
  }

  function saveCurrentResult() {
    if (!currentResult) return alert('No result to save');
    // normalize to ensure charts can use it
    const r = normalizeResultForCharts(Object.assign({}, currentResult));
    const saved = loadResults();
    saved.unshift(r);
    localStorage.setItem('tremor_results', JSON.stringify(saved));
    refreshSessionsUI();
    updateAttachOptions();
    renderCharts();
    alert('Result saved');
  }

  function loadResults(){
    try{ return JSON.parse(localStorage.getItem('tremor_results')||'[]'); }catch(e){ return [] }
  }

  function refreshSessionsUI(){
    const saved = loadResults();
    sessionsList.innerHTML='';
    if (saved.length===0) sessionsList.innerHTML = '<li class="small">No saved sessions yet.</li>';
    saved.forEach(r=>{
      const li = document.createElement('li');
      li.innerHTML = `<div><strong>${new Date(r.date).toLocaleString()}</strong><div class="small">Freq ${r.dominantFreq.toFixed(2)} Hz · Amp ${r.avgAmplitude.toFixed(3)}</div></div>
      <div><button data-id="${r.id}" class="btn-view">View</button> <button data-id="${r.id}" class="btn-delete">Delete</button></div>`;
      sessionsList.appendChild(li);
    });
    // attach view/delete handlers
    document.querySelectorAll('.btn-delete').forEach(b=> b.addEventListener('click', (ev)=>{
      const id = ev.currentTarget.dataset.id; deleteResult(id);
    }));
    document.querySelectorAll('.btn-view').forEach(b=> b.addEventListener('click', (ev)=>{
      const id = ev.currentTarget.dataset.id; viewResult(id);
    }));
  }

  function updateAttachOptions(){
    const saved = loadResults();
    attachResult.innerHTML = '<option value="">(most recent)</option>' + saved.map(s=>`<option value="${s.id}">${new Date(s.date).toLocaleString()} — ${s.dominantFreq.toFixed(2)}Hz</option>`).join('');
  }

  function viewResult(id){
    const saved = loadResults();
    const r = saved.find(x=>x.id===id);
    if (!r) return alert('Not found');
    // show in check page
    navigate('check', document.querySelector('nav button[data-target="check"]'));
    resDuration.textContent = r.duration.toFixed(2);
    resAmp.textContent = r.avgAmplitude.toFixed(3);
    resFreq.textContent = r.dominantFreq.toFixed(2);
    resDetect.textContent = r.tremorDetected ? 'Likely' : 'Not Clear';
    resultBox.classList.remove('hidden');
    currentResult = r;
  }

  function deleteResult(id){
    let saved = loadResults();
    saved = saved.filter(s=>s.id!==id);
    localStorage.setItem('tremor_results', JSON.stringify(saved));
    refreshSessionsUI(); updateAttachOptions(); renderCharts();
  }

  // Documents
  function saveDocument(ev){
    ev.preventDefault();
    const title = document.getElementById('docTitle').value.trim();
    const notes = document.getElementById('docNotes').value.trim();
    const attachId = attachResult.value || (currentResult && currentResult.id) || null;
    let docs = JSON.parse(localStorage.getItem('tremor_docs') || '[]');
    // remove any auto draft attached to the same result
    if (attachId) {
      docs = docs.filter(d => !(d.attach === attachId && d.autoDraft));
    }
    docs.unshift({ id:'d_'+Date.now(), date:new Date().toISOString(), title, notes, attach:attachId, autoDraft:false });
    localStorage.setItem('tremor_docs', JSON.stringify(docs));
    docForm.reset();
    refreshDocsUI();
    alert('Document saved');
  }

  // Create an auto-generated draft for a result (if not already present)
  function createAutoDoc(result){
    if (!result) return;
    const docs = JSON.parse(localStorage.getItem('tremor_docs') || '[]');
    const existing = docs.find(d => d.attach === result.id && d.autoDraft);
    if (existing) return existing;
    const title = `Auto: Check ${new Date(result.date).toLocaleString()}`;
    const domFreq = (result.dominantFreq != null) ? `${result.dominantFreq.toFixed(2)} Hz` : (result.trace ? `Trace accuracy ${result.trace.accPct}%` : 'N/A');
    const avgAmpStr = (result.avgAmplitude != null) ? result.avgAmplitude.toFixed(3) : (result.trace ? `Severity ${result.trace.severityLabel}` : 'N/A');
    const tremorLabel = (result.tremorDetected != null) ? (result.tremorDetected ? 'Likely' : 'Not Clear') : (result.trace ? (result.trace.severityScore > 60 ? 'Likely' : (result.trace.severityScore > 30 ? 'Possible' : 'Not Clear')) : 'Not Clear');
    const notes = `Auto-generated from check. ${domFreq}, Avg amplitude: ${avgAmpStr}. Tremor: ${tremorLabel}`;
    const doc = { id: 'd_auto_' + result.id, date: new Date().toISOString(), title, notes, attach: result.id, autoDraft: true };
    docs.unshift(doc);
    localStorage.setItem('tremor_docs', JSON.stringify(docs));
    autoDocPreview.classList.remove('hidden');
    autoDocPreview.innerHTML = `<strong>Auto Draft:</strong> ${title} <div class="small">${notes}</div>`;
    return doc;
  }

  function removeAutoDraftForResult(resultId){
    let docs = JSON.parse(localStorage.getItem('tremor_docs') || '[]');
    docs = docs.filter(d => !(d.attach === resultId && d.autoDraft));
    localStorage.setItem('tremor_docs', JSON.stringify(docs));
  }

  function prefillDocumentForm(result){
    if (!result) return;
    document.getElementById('docTitle').value = `Check on ${new Date(result.date).toLocaleString()}`;
    if (result.trace) {
      document.getElementById('docNotes').value = `Auto summary: Trace accuracy ${result.trace.accPct}%, severity ${result.trace.severityLabel} (${result.trace.severityScore}).`;
    } else {
      const df = result.dominantFreq != null ? `${result.dominantFreq.toFixed(2)} Hz` : 'N/A';
      const aa = result.avgAmplitude != null ? result.avgAmplitude.toFixed(3) : 'N/A';
      document.getElementById('docNotes').value = `Auto summary: Dominant freq ${df}, avg amplitude ${aa}. Tremor: ${result.tremorDetected ? 'Likely' : 'Not Clear'}`;
    }
    attachResult.value = result.id;
    autoDocPreview.classList.remove('hidden');
    autoDocPreview.innerHTML = `<strong>Auto Draft:</strong> ${document.getElementById('docTitle').value} <div class="small">${document.getElementById('docNotes').value}</div>`;
  }

  function refreshDocsUI(){
    const docs = JSON.parse(localStorage.getItem('tremor_docs') || '[]');
    docsList.innerHTML = '';
    if (docs.length === 0) docsList.innerHTML = '<li class="small">No documents yet.</li>';
    docs.forEach(d => {
      const li = document.createElement('li');
      li.innerHTML = `<div><strong>${d.title}</strong> <div class="small">${new Date(d.date).toLocaleString()} ${d.autoDraft?'<span class="badge-auto">Auto</span>':''}</div></div>
        <div><button data-id="${d.id}" class="btn-view-doc">View</button> <button data-id="${d.id}" class="btn-delete-doc">Delete</button></div>`;
      docsList.appendChild(li);
    });
    document.querySelectorAll('.btn-delete-doc').forEach(b=> b.addEventListener('click', (ev)=>{ const id=ev.currentTarget.dataset.id; deleteDoc(id);}));
    document.querySelectorAll('.btn-view-doc').forEach(b=> b.addEventListener('click', (ev)=>{ const id=ev.currentTarget.dataset.id; viewDoc(id);}));
  }

  function viewDoc(id){
    const docs = JSON.parse(localStorage.getItem('tremor_docs') || '[]');
    const d = docs.find(x=>x.id===id);
    if (!d) return alert('Document not found');
    // fill form with doc contents for editing
    document.getElementById('docTitle').value = d.title;
    document.getElementById('docNotes').value = d.notes;
    attachResult.value = d.attach || '';
    // remove the autoDraft preview if it belongs to this doc
    if (d.autoDraft) autoDocPreview.classList.remove('hidden'); else autoDocPreview.classList.add('hidden');
    // navigate to doc
    navigate('document', document.querySelector('nav button[data-target="document"]'));
  }

  function deleteDoc(id){
    let docs = JSON.parse(localStorage.getItem('tremor_docs') || '[]');
    docs = docs.filter(d => d.id !== id);
    localStorage.setItem('tremor_docs', JSON.stringify(docs));
    refreshDocsUI();
  }

  // Charts
  function renderCharts(){
    const saved = loadResults();
    const labels = saved.map(s=> new Date(s.date).toLocaleDateString());
    ampChart.data.labels = labels;
    ampChart.data.datasets[0].data = saved.map(s=> Number(s.avgAmplitude || 0).toFixed(3));
    ampChart.update();

    freqChart.data.labels = labels;
    freqChart.data.datasets[0].data = saved.map(s=> Number(s.dominantFreq || 0).toFixed(2));
    freqChart.update();
  }

  // Preview the current (unsaved) result on the charts without persisting
  function previewResultOnCharts(r){
    if (!r) return;
    const saved = loadResults();
    const preview = normalizeResultForCharts(Object.assign({}, r));
    const previewLabel = preview.date ? new Date(preview.date).toLocaleDateString() : 'Now';

    const labels = [previewLabel].concat(saved.map(s=> new Date(s.date).toLocaleDateString()));
    ampChart.data.labels = labels;
    ampChart.data.datasets[0].data = [preview.avgAmplitude.toFixed(3)].concat(saved.map(s=> s.avgAmplitude.toFixed(3)));
    ampChart.update();

    freqChart.data.labels = labels;
    freqChart.data.datasets[0].data = [preview.dominantFreq.toFixed(2)].concat(saved.map(s=> s.dominantFreq.toFixed(2)));
    freqChart.update();
  }

  // Sample data + clear
  function addSampleDataset(){
    const saved = loadResults();
    for (let i=0;i<6;i++){
      const f = 3.5 + Math.random()*3;
      const amp = 0.04 + Math.random()*0.5;
      saved.push({ id:'r_s_'+Date.now()+i, date: new Date(Date.now() - (6-i)*86400000).toISOString(), duration:8, avgAmplitude:amp, dominantFreq:f, power:1.0, tremorDetected: f>=3 && f<=7 && amp>0.05 });
    }
    localStorage.setItem('tremor_results', JSON.stringify(saved));
    refreshSessionsUI(); updateAttachOptions(); renderCharts();
  }

  function clearAllData(){
    if (!confirm('Clear all saved results and documents?')) return;
    localStorage.removeItem('tremor_results'); localStorage.removeItem('tremor_docs');
    refreshSessionsUI(); updateAttachOptions(); renderCharts();
  }

});
