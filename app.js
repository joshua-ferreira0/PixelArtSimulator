const PALETTE_COLORS = [
  '#000000', '#ffffff', '#64748b', '#94a3b8',
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#78350f', '#fbbf24',
  '#84cc16', '#0ea5e9'
];

const DISPLAY_SIZE = 512;

let gridSize = 16;
let frames = [createEmptyFrame(gridSize)];
let currentFrame = 0;
let currentTool = 'pencil';
let currentColor = '#22c55e';
let brushSize = 1;
let isDrawing = false;
let lastCoord = null;
let showGrid = true;
let zoom = 1;

let undoStack = [];
let redoStack = [];

const checkerCanvas = document.getElementById('checker-canvas');
const paintCanvas = document.getElementById('paint-canvas');
const gridCanvas = document.getElementById('grid-canvas');
const cursorCanvas = document.getElementById('cursor-canvas');
const previewCanvas = document.getElementById('preview-canvas');

const checkerCtx = checkerCanvas.getContext('2d');
const paintCtx = paintCanvas.getContext('2d');
const gridCtx = gridCanvas.getContext('2d');
const cursorCtx = cursorCanvas.getContext('2d');
const previewCtx = previewCanvas.getContext('2d');

const canvasWrapper = document.getElementById('canvas-wrapper');
const colorInput = document.getElementById('color-input');
const colorHex = document.getElementById('color-hex');
const paletteContainer = document.getElementById('palette');
const framesListContainer = document.getElementById('frames-list');
const toggleGridInput = document.getElementById('toggle-grid');
const gridSizeSelect = document.getElementById('grid-size');
const zoomLevelText = document.getElementById('zoom-level');

const exportModal = document.getElementById('export-modal');
const exportScaleSelect = document.getElementById('export-scale');
const exportDimensions = document.getElementById('export-dimensions');

function createEmptyFrame(size) {
  const frame = [];
  for (let y = 0; y < size; y++) {
    frame.push(new Array(size).fill(null));
  }
  return frame;
}

function cloneFrame(frame) {
  return frame.map(row => [...row]);
}

function init() {
  setupCanvases();
  setupPalette();
  setupEventListeners();
  renderAll();
  updateFramesUI();
}

function setupCanvases() {
  canvasWrapper.style.width = `${DISPLAY_SIZE}px`;
  canvasWrapper.style.height = `${DISPLAY_SIZE}px`;

  checkerCanvas.width = DISPLAY_SIZE;
  checkerCanvas.height = DISPLAY_SIZE;

  paintCanvas.width = gridSize;
  paintCanvas.height = gridSize;
  paintCanvas.style.width = `${DISPLAY_SIZE}px`;
  paintCanvas.style.height = `${DISPLAY_SIZE}px`;

  gridCanvas.width = DISPLAY_SIZE;
  gridCanvas.height = DISPLAY_SIZE;

  cursorCanvas.width = DISPLAY_SIZE;
  cursorCanvas.height = DISPLAY_SIZE;

  drawCheckerboard();
}

function drawCheckerboard() {
  const cellSize = 16;
  const rows = checkerCanvas.height / cellSize;
  const cols = checkerCanvas.width / cellSize;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      checkerCtx.fillStyle = (r + c) % 2 === 0 ? '#1e293b' : '#0f172a';
      checkerCtx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }
}

function renderPaintCanvas() {
  paintCtx.clearRect(0, 0, gridSize, gridSize);
  const frame = frames[currentFrame];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (frame[y][x]) {
        paintCtx.fillStyle = frame[y][x];
        paintCtx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function renderGrid() {
  gridCtx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  if (!showGrid) return;

  gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  gridCtx.lineWidth = 1;

  const step = DISPLAY_SIZE / gridSize;

  gridCtx.beginPath();
  for (let i = 0; i <= gridSize; i++) {
    const pos = Math.round(i * step);
    gridCtx.moveTo(pos, 0);
    gridCtx.lineTo(pos, DISPLAY_SIZE);
    gridCtx.moveTo(0, pos);
    gridCtx.lineTo(DISPLAY_SIZE, pos);
  }
  gridCtx.stroke();
}

function renderPreview(frameIndex = currentFrame) {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.imageSmoothingEnabled = false;

  const frame = frames[frameIndex];
  if (!frame) return;

  const pixelSize = previewCanvas.width / gridSize;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (frame[y][x]) {
        previewCtx.fillStyle = frame[y][x];
        previewCtx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      }
    }
  }
}

function renderAll() {
  renderPaintCanvas();
  renderGrid();
  renderPreview();
}

function setupPalette() {
  paletteContainer.innerHTML = '';
  PALETTE_COLORS.forEach((color, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch' + (color.toLowerCase() === currentColor.toLowerCase() ? ' active' : '');
    swatch.style.backgroundColor = color;
    swatch.addEventListener('click', () => setColor(color));
    paletteContainer.appendChild(swatch);
  });
}

function setColor(hex) {
  currentColor = hex;
  colorInput.value = hex;
  colorHex.textContent = hex;

  document.querySelectorAll('.swatch').forEach(swatch => {
    const bg = rgbToHex(swatch.style.backgroundColor);
    swatch.classList.toggle('active', bg.toLowerCase() === hex.toLowerCase());
  });
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb;
  const vals = rgb.match(/\d+/g);
  if (!vals) return '#000000';
  return '#' + vals.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
}

function getPointerGridPos(e) {
  const rect = canvasWrapper.getBoundingClientRect();
  const rawX = (e.clientX - rect.left) / zoom;
  const rawY = (e.clientY - rect.top) / zoom;

  const cellPixel = DISPLAY_SIZE / gridSize;
  const x = Math.floor(rawX / cellPixel);
  const y = Math.floor(rawY / cellPixel);

  return { x, y, inBounds: x >= 0 && x < gridSize && y >= 0 && y < gridSize };
}

function applyBrush(x, y, color) {
  const offset = Math.floor(brushSize / 2);
  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const px = x - offset + dx;
      const py = y - offset + dy;
      if (px >= 0 && px < gridSize && py >= 0 && py < gridSize) {
        frames[currentFrame][py][px] = color;
      }
    }
  }
}

function drawLine(x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    applyBrush(x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function floodFill(startX, startY, fillCol) {
  const frame = frames[currentFrame];
  const targetCol = frame[startY][startX];
  if (targetCol === fillCol) return;

  const queue = [[startX, startY]];
  const visited = new Uint8Array(gridSize * gridSize);
  visited[startY * gridSize + startX] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    frame[y][x] = fillCol;

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];

    for (let i = 0; i < neighbors.length; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        const idx = ny * gridSize + nx;
        if (!visited[idx] && frame[ny][nx] === targetCol) {
          visited[idx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }
}

function saveHistoryState() {
  undoStack.push(cloneFrame(frames[currentFrame]));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(cloneFrame(frames[currentFrame]));
  frames[currentFrame] = undoStack.pop();
  renderAll();
  updateFramesUI();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(cloneFrame(frames[currentFrame]));
  frames[currentFrame] = redoStack.pop();
  renderAll();
  updateFramesUI();
}

function drawCursorOverlay(pos) {
  cursorCtx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  if (!pos || !pos.inBounds) return;

  const step = DISPLAY_SIZE / gridSize;
  const offset = Math.floor(brushSize / 2);
  const startX = (pos.x - offset) * step;
  const startY = (pos.y - offset) * step;
  const size = brushSize * step;

  cursorCtx.strokeStyle = '#ffffff';
  cursorCtx.lineWidth = 1.5;
  cursorCtx.strokeRect(startX + 0.5, startY + 0.5, size - 1, size - 1);
}

function handlePointerDown(e) {
  const pos = getPointerGridPos(e);
  if (!pos.inBounds) return;

  isDrawing = true;
  lastCoord = { x: pos.x, y: pos.y };
  saveHistoryState();

  if (currentTool === 'pencil') {
    applyBrush(pos.x, pos.y, currentColor);
  } else if (currentTool === 'eraser') {
    applyBrush(pos.x, pos.y, null);
  } else if (currentTool === 'bucket') {
    floodFill(pos.x, pos.y, currentColor);
    isDrawing = false;
  } else if (currentTool === 'picker') {
    const picked = frames[currentFrame][pos.y][pos.x];
    if (picked) setColor(picked);
    isDrawing = false;
  }

  renderAll();
  updateActiveFrameThumb();
}

function handlePointerMove(e) {
  const pos = getPointerGridPos(e);
  drawCursorOverlay(pos);

  if (!isDrawing || !pos.inBounds) return;

  const color = currentTool === 'eraser' ? null : currentColor;

  if (lastCoord) {
    drawLine(lastCoord.x, lastCoord.y, pos.x, pos.y, color);
  } else {
    applyBrush(pos.x, pos.y, color);
  }

  lastCoord = { x: pos.x, y: pos.y };
  renderPaintCanvas();
  renderPreview();
  updateActiveFrameThumb();
}

function handlePointerUp() {
  isDrawing = false;
  lastCoord = null;
}

function updateFramesUI() {
  framesListContainer.innerHTML = '';

  frames.forEach((frame, index) => {
    const item = document.createElement('div');
    item.className = 'frame-item' + (index === currentFrame ? ' active' : '');
    item.dataset.index = index;

    const thumb = document.createElement('canvas');
    thumb.className = 'frame-thumb';
    thumb.width = 36;
    thumb.height = 36;
    drawThumb(thumb, frame);

    const label = document.createElement('span');
    label.className = 'frame-number';
    label.textContent = `Frame ${index + 1}`;

    item.appendChild(thumb);
    item.appendChild(label);

    item.addEventListener('click', () => {
      currentFrame = index;
      undoStack = [];
      redoStack = [];
      renderAll();
      updateFramesUI();
    });

    framesListContainer.appendChild(item);
  });
}

function drawThumb(canvas, frame) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const pixelSize = canvas.width / gridSize;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (frame[y][x]) {
        ctx.fillStyle = frame[y][x];
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      }
    }
  }
}

function updateActiveFrameThumb() {
  const activeItem = framesListContainer.querySelector(`.frame-item[data-index="${currentFrame}"]`);
  if (!activeItem) return;
  const thumb = activeItem.querySelector('.frame-thumb');
  if (thumb) {
    drawThumb(thumb, frames[currentFrame]);
  }
}

function addFrame() {
  frames.push(createEmptyFrame(gridSize));
  currentFrame = frames.length - 1;
  undoStack = [];
  redoStack = [];
  renderAll();
  updateFramesUI();
}

function duplicateFrame() {
  frames.splice(currentFrame + 1, 0, cloneFrame(frames[currentFrame]));
  currentFrame++;
  undoStack = [];
  redoStack = [];
  renderAll();
  updateFramesUI();
}

function deleteFrame() {
  if (frames.length <= 1) {
    frames[0] = createEmptyFrame(gridSize);
    renderAll();
    updateFramesUI();
    return;
  }
  frames.splice(currentFrame, 1);
  if (currentFrame >= frames.length) currentFrame = frames.length - 1;
  undoStack = [];
  redoStack = [];
  renderAll();
  updateFramesUI();
}

function setZoom(val) {
  zoom = Math.max(0.5, Math.min(3, val));
  canvasWrapper.style.transform = `scale(${zoom})`;
  zoomLevelText.textContent = `${Math.round(zoom * 100)}%`;
}

function openExportModal() {
  updateExportDimensions();
  exportModal.classList.add('open');
}

function closeExportModal() {
  exportModal.classList.remove('open');
}

function updateExportDimensions() {
  const scale = parseInt(exportScaleSelect.value);
  const dim = gridSize * scale;
  const type = document.querySelector('input[name="export-type"]:checked').value;

  if (type === 'spritesheet') {
    exportDimensions.textContent = `Dimensions: ${dim * frames.length} x ${dim} px (${frames.length} frames)`;
  } else if (type === 'single') {
    exportDimensions.textContent = `Dimensions: ${dim} x ${dim} px`;
  } else {
    exportDimensions.textContent = 'JSON file with frames array and palette data';
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportArtwork() {
  const type = document.querySelector('input[name="export-type"]:checked').value;
  const scale = parseInt(exportScaleSelect.value);

  if (type === 'json') {
    const data = {
      gridSize,
      frames
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'pixel-art.json');
    closeExportModal();
    return;
  }

  const offscreen = document.createElement('canvas');
  const oCtx = offscreen.getContext('2d');
  oCtx.imageSmoothingEnabled = false;

  if (type === 'single') {
    offscreen.width = gridSize * scale;
    offscreen.height = gridSize * scale;

    const frame = frames[currentFrame];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (frame[y][x]) {
          oCtx.fillStyle = frame[y][x];
          oCtx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }

    offscreen.toBlob(blob => {
      triggerDownload(blob, `pixel-art-${gridSize}x${gridSize}.png`);
      closeExportModal();
    }, 'image/png');
  } else if (type === 'spritesheet') {
    offscreen.width = gridSize * scale * frames.length;
    offscreen.height = gridSize * scale;

    frames.forEach((frame, fIndex) => {
      const offsetX = fIndex * gridSize * scale;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          if (frame[y][x]) {
            oCtx.fillStyle = frame[y][x];
            oCtx.fillRect(offsetX + (x * scale), y * scale, scale, scale);
          }
        }
      }
    });

    offscreen.toBlob(blob => {
      triggerDownload(blob, `spritesheet-${frames.length}frames.png`);
      closeExportModal();
    }, 'image/png');
  }
}

function setupEventListeners() {
  canvasWrapper.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);

  cursorCanvas.addEventListener('mouseleave', () => {
    cursorCtx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  });

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
    });
  });

  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushSize = parseInt(btn.dataset.size);
    });
  });

  colorInput.addEventListener('input', (e) => {
    setColor(e.target.value);
  });

  toggleGridInput.addEventListener('change', (e) => {
    showGrid = e.target.checked;
    renderGrid();
  });

  gridSizeSelect.addEventListener('change', (e) => {
    const newSize = parseInt(e.target.value);
    gridSize = newSize;
    frames = [createEmptyFrame(gridSize)];
    currentFrame = 0;
    undoStack = [];
    redoStack = [];
    setupCanvases();
    renderAll();
    updateFramesUI();
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  document.getElementById('btn-clear').addEventListener('click', () => {
    saveHistoryState();
    frames[currentFrame] = createEmptyFrame(gridSize);
    renderAll();
    updateFramesUI();
  });

  document.getElementById('btn-add-frame').addEventListener('click', addFrame);
  document.getElementById('btn-duplicate-frame').addEventListener('click', duplicateFrame);
  document.getElementById('btn-delete-frame').addEventListener('click', deleteFrame);

  document.getElementById('zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
  document.getElementById('zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
  document.getElementById('zoom-reset').addEventListener('click', () => setZoom(1));

  document.getElementById('btn-export-modal').addEventListener('click', openExportModal);
  document.getElementById('modal-close').addEventListener('click', closeExportModal);
  document.getElementById('modal-cancel').addEventListener('click', closeExportModal);
  document.getElementById('modal-download').addEventListener('click', exportArtwork);

  document.querySelectorAll('input[name="export-type"]').forEach(r => {
    r.addEventListener('change', (e) => {
      document.getElementById('scale-group').style.display = e.target.value === 'json' ? 'none' : 'flex';
      updateExportDimensions();
    });
  });

  exportScaleSelect.addEventListener('change', updateExportDimensions);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key.toLowerCase() === 'p') {
      document.querySelector('.tool-btn[data-tool="pencil"]').click();
    } else if (e.key.toLowerCase() === 'e') {
      document.querySelector('.tool-btn[data-tool="eraser"]').click();
    } else if (e.key.toLowerCase() === 'b') {
      document.querySelector('.tool-btn[data-tool="bucket"]').click();
    } else if (e.key.toLowerCase() === 'i') {
      document.querySelector('.tool-btn[data-tool="picker"]').click();
    }
  });
}

init();
