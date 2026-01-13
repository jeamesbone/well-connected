/**
 * Well Connected — NYT Connections Helper
 * Vanilla JS implementation
 */

// State
const state = {
    tiles: [],
    scratchpad: [null, null, null, null], // 4 scratchpad slots
    selectedTiles: new Set(), // Set of "source:index" strings for selected tiles
    draggedTile: null,
    draggedSource: null, // 'grid' or 'scratchpad'
    debugVisible: false, // Debug overlay visibility
    detectedWords: [] // All words detected by OCR for debug visualization
};

// DOM Elements
const elements = {
    uploadArea: document.getElementById('uploadArea'),
    uploadMinimized: document.getElementById('uploadMinimized'),
    expandUploadBtn: document.getElementById('expandUploadBtn'),
    fileInput: document.getElementById('fileInput'),
    previewContainer: document.getElementById('previewContainer'),
    previewWrapper: document.getElementById('previewWrapper'),
    previewImage: document.getElementById('previewImage'),
    debugCanvas: document.getElementById('debugCanvas'),
    debugToggle: document.getElementById('debugToggle'),
    clearBtn: document.getElementById('clearBtn'),
    uploadSection: document.getElementById('uploadSection'),
    statusSection: document.getElementById('statusSection'),
    statusText: document.getElementById('statusText'),
    gridSection: document.getElementById('gridSection'),
    tileGrid: document.getElementById('tileGrid'),
    scratchpad: document.getElementById('scratchpad'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    colorBtns: document.querySelectorAll('.color-btn'),
    modal: document.getElementById('definitionModal'),
    modalWord: document.getElementById('modalWord'),
    modalDefinition: document.getElementById('modalDefinition'),
    modalClose: document.getElementById('modalClose'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    helpModalClose: document.getElementById('helpModalClose')
};

// Storage key
const STORAGE_KEY = 'wellconnected_state';

// Initialize
function init() {
    setupUploadHandlers();
    setupColorPalette();
    setupShuffleButton();
    setupModal();
    setupHelpModal();
    setupScratchpad();
    setupDebugToggle();
    loadSavedState();
}

// ==================== Local Storage ====================

function saveState() {
    const data = {
        tiles: state.tiles,
        scratchpad: state.scratchpad
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSavedState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.tiles && data.tiles.length > 0) {
                state.tiles = data.tiles;
                state.scratchpad = data.scratchpad || [null, null, null, null];
                
                // Minimize the upload section
                elements.uploadArea.hidden = true;
                elements.uploadMinimized.hidden = false;
                
                // Show the grid section
                elements.gridSection.hidden = false;
                renderGrid();
            }
        }
    } catch (e) {
        console.error('Failed to load saved state:', e);
    }
}

function clearSavedState() {
    localStorage.removeItem(STORAGE_KEY);
}

// ==================== Upload Handling ====================

function setupUploadHandlers() {
    // Click to upload
    elements.uploadArea.addEventListener('click', () => {
        elements.fileInput.click();
    });

    // File selected
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag and drop
    elements.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.add('drag-over');
    });

    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.classList.remove('drag-over');
    });

    elements.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Clear button
    elements.clearBtn.addEventListener('click', resetUpload);
    
    // Expand upload button (when minimized)
    elements.expandUploadBtn.addEventListener('click', () => {
        elements.fileInput.click();
    });
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.previewImage.src = e.target.result;
        elements.uploadArea.hidden = true;
        
        // Set visibility based on debug state (show container when debug is on)
        elements.previewContainer.hidden = !state.debugVisible;
        elements.previewImage.hidden = !state.debugVisible;
        elements.debugCanvas.hidden = !state.debugVisible;
        
        // Process image
        processImage(file);
    };
    reader.readAsDataURL(file);
}

function resetUpload() {
    elements.fileInput.value = '';
    elements.previewImage.src = '';
    elements.uploadArea.hidden = false;
    elements.uploadMinimized.hidden = true;
    elements.previewContainer.hidden = true;
    elements.statusSection.hidden = true;
    elements.gridSection.hidden = true;
    state.tiles = [];
    state.scratchpad = [null, null, null, null];
    state.selectedTiles.clear();
    state.detectedWords = [];
    
    // Clear saved state
    clearSavedState();
    
    // Clear debug canvas
    const ctx = elements.debugCanvas.getContext('2d');
    ctx.clearRect(0, 0, elements.debugCanvas.width, elements.debugCanvas.height);
}

// ==================== OCR Processing ====================

async function processImage(file) {
    elements.statusSection.hidden = false;
    elements.statusText.textContent = 'Detecting grid...';

    try {
        // Check if Tesseract is loaded
        if (typeof Tesseract === 'undefined') {
            throw new Error('OCR library not loaded. Please check your internet connection.');
        }

        elements.statusText.textContent = 'Detecting grid...';
        
        // Detect the grid region on the original image
        const detectedBounds = await detectGridBounds(file);
        console.log('Detected grid bounds:', detectedBounds);
        
        // Add padding to cover missed edges
        const padding = 20;
        const imageWidth = detectedBounds.imageWidth || detectedBounds.width + detectedBounds.x;
        const imageHeight = detectedBounds.imageHeight || detectedBounds.height + detectedBounds.y;
        
        const paddedX = Math.max(0, detectedBounds.x - padding);
        const paddedY = Math.max(0, detectedBounds.y - padding);
        const paddedWidth = Math.min(
            detectedBounds.width + (padding * 2),
            imageWidth - paddedX
        );
        const paddedHeight = Math.min(
            detectedBounds.height + (padding * 2),
            imageHeight - paddedY
        );
        
        const gridBounds = {
            x: paddedX,
            y: paddedY,
            width: paddedWidth,
            height: paddedHeight,
            imageWidth: imageWidth,
            imageHeight: imageHeight
        };
        
        console.log('Grid bounds with padding:', gridBounds);
        
        // Store grid bounds for debug toggle
        state.lastGridBounds = gridBounds;
        
        // Draw debug overlay showing detected bounds
        drawDebugOverlay(gridBounds);

        elements.statusText.textContent = 'Cropping image...';
        
        // Crop the image to the grid bounds (with padding)
        const croppedBlob = await cropImage(file, gridBounds);

        elements.statusText.textContent = 'Initializing OCR...';

        // Create Tesseract worker
        const { createWorker } = Tesseract;
        const worker = await createWorker('eng');
        
        elements.statusText.textContent = 'Reading text...';

        // Calculate cell dimensions
        const cellWidth = gridBounds.width / 4;
        const cellHeight = gridBounds.height / 4;
        console.log('[OCR] Cropped grid dimensions:', gridBounds.width, 'x', gridBounds.height);
        console.log('[OCR] Cell dimensions:', cellWidth.toFixed(1), 'x', cellHeight.toFixed(1));
        
        // Run OCR on each cell individually using rectangle option
        const words = [];
        const totalCells = 16;
        state.detectedWords = [];
        
        for (let i = 0; i < totalCells; i++) {
            const progress = Math.round(((i + 1) / totalCells) * 100);
            elements.statusText.textContent = `Reading text... ${progress}%`;
            
            const row = Math.floor(i / 4);
            const col = i % 4;
            const cellX = col * cellWidth;
            const cellY = row * cellHeight;
            
            // Shrink rectangle by 10px on all sides to remove borders
            const borderPadding = 10;
            const rectX = cellX + borderPadding;
            const rectY = cellY + borderPadding;
            const rectWidth = cellWidth - (borderPadding * 2);
            const rectHeight = cellHeight - (borderPadding * 2);
            
            console.log(`[Cell ${i + 1}/16 (Row ${row + 1}, Col ${col + 1})] Starting OCR at rectangle (${rectX.toFixed(1)}, ${rectY.toFixed(1)}, ${rectWidth.toFixed(1)}, ${rectHeight.toFixed(1)})...`);
            
            // Run OCR on this specific cell using rectangle option
            const { data: result } = await worker.recognize(croppedBlob, {
                rectangle: {
                    top: rectY,
                    left: rectX,
                    width: rectWidth,
                    height: rectHeight
                }
            });
            
            // Extract all words from this cell and concatenate them
            let cellWords = [];
            
            if (result.words && result.words.length > 0) {
                console.log(`[Cell ${i + 1}/16] Found ${result.words.length} word(s):`, result.words.map(w => w.text));
                // Collect all words from the cell
                for (const word of result.words) {
                    const cleaned = word.text.replace(/[^a-zA-Z0-9'-\s]/g, '').trim();
                    if (cleaned.length >= 2) {
                        cellWords.push(cleaned.toUpperCase());
                    }
                    // Store for debug overlay (adjust bbox to be relative to full cropped image)
                    if (word.bbox) {
                        state.detectedWords.push({
                            text: cleaned.toUpperCase(),
                            bbox: {
                                x0: word.bbox.x0 + rectX,
                                y0: word.bbox.y0 + rectY,
                                x1: word.bbox.x1 + rectX,
                                y1: word.bbox.y1 + rectY
                            }
                        });
                    }
                }
            }
            
            // Fallback: try lines if no words found
            if (cellWords.length === 0 && result.lines && result.lines.length > 0) {
                console.log(`[Cell ${i + 1}/16] No words found, trying lines:`, result.lines.map(l => l.text));
                for (const line of result.lines) {
                    if (line.text) {
                        const cleaned = line.text.replace(/[^a-zA-Z0-9'-\s]/g, '').trim();
                        if (cleaned.length >= 2) {
                            cellWords.push(cleaned.toUpperCase());
                        }
                    }
                }
            }
            
            // Concatenate all words with spaces
            const cellWord = cellWords.join(' ');
            console.log(`[Cell ${i + 1}/16] Final result: "${cellWord}"`);
            words.push(cellWord);
        }
        
        // Terminate worker
        await worker.terminate();
        
        elements.statusText.textContent = 'Extracting tiles...';
        
        // Filter out empty words and store detected words for debug
        const detectedWords = [];
        const validWords = words.filter((word, index) => {
            if (word && word.length >= 2) {
                detectedWords.push({
                    text: word,
                    centerX: (index % 4) * (gridBounds.width / 4) + (gridBounds.width / 8),
                    centerY: Math.floor(index / 4) * (gridBounds.height / 4) + (gridBounds.height / 8),
                    bbox: {
                        x0: (index % 4) * (gridBounds.width / 4),
                        y0: Math.floor(index / 4) * (gridBounds.height / 4),
                        x1: ((index % 4) + 1) * (gridBounds.width / 4),
                        y1: (Math.floor(index / 4) + 1) * (gridBounds.height / 4)
                    }
                });
                return true;
            }
            return false;
        });
        
        state.detectedWords = detectedWords;
        
        // Update preview to show processed image
        elements.previewImage.src = URL.createObjectURL(croppedBlob);

        // Redraw debug overlay with word boxes
        if (state.debugVisible && state.lastGridBounds) {
            drawDebugOverlay(state.lastGridBounds);
        }
        
        if (validWords.length === 0) {
            throw new Error('No words found. Please ensure the image shows a Connections puzzle grid.');
        }

        // Pad or trim to 16 tiles (words are already in grid order)
        state.tiles = normalizeToGrid(validWords);
        
        elements.statusSection.hidden = true;
        elements.gridSection.hidden = false;
        
        renderGrid();

    } catch (error) {
        console.error('OCR Error:', error);
        elements.statusText.textContent = `Error: ${error.message}`;
        
        // Show manual entry fallback after a delay
        setTimeout(() => {
            if (confirm('OCR failed. Would you like to enter words manually?')) {
                showManualEntry();
            }
        }, 1500);
    }
}


/**
 * Draw a debug overlay showing the detected grid bounds
 */
function drawDebugOverlay(gridBounds) {
    const canvas = elements.debugCanvas;
    const img = elements.previewImage;
    
    // Wait for image to load to get display dimensions
    if (!img.complete) {
        img.onload = () => drawDebugOverlay(gridBounds);
        return;
    }
    
    // Set canvas size to match displayed image
    const displayWidth = img.clientWidth;
    const displayHeight = img.clientHeight;
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Scale factor from original image to displayed size
    const scaleX = displayWidth / gridBounds.imageWidth;
    const scaleY = displayHeight / gridBounds.imageHeight;
    
    // Draw detected word boxes in purple
    if (state.detectedWords && state.detectedWords.length > 0) {
        ctx.strokeStyle = '#9b59b6'; // Purple
        ctx.lineWidth = 2;
        ctx.setLineDash([]); // Solid lines
        
        for (const word of state.detectedWords) {
            if (word.bbox) {
                const wordX = word.bbox.x0 * scaleX;
                const wordY = word.bbox.y0 * scaleY;
                const wordW = (word.bbox.x1 - word.bbox.x0) * scaleX;
                const wordH = (word.bbox.y1 - word.bbox.y0) * scaleY;
                
                // Draw word bounding box
                ctx.strokeRect(wordX, wordY, wordW, wordH);
                
                // Optionally draw word text (small, at top of box)
                ctx.fillStyle = '#9b59b6';
                ctx.font = '10px system-ui, sans-serif';
                ctx.fillText(word.text, wordX + 2, wordY - 2);
            }
        }
    }
    
    // Draw cell boundaries (4x4 grid = 16 cells)
    const gridX = gridBounds.x * scaleX;
    const gridY = gridBounds.y * scaleY;
    const gridW = gridBounds.width * scaleX;
    const gridH = gridBounds.height * scaleY;
    const cellW = gridW / 4;
    const cellH = gridH / 4;
    
    ctx.strokeStyle = '#3498db'; // Blue
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); // Dashed lines
    
    // Draw vertical lines (3 lines to divide into 4 columns)
    for (let i = 1; i < 4; i++) {
        const x = gridX + (i * cellW);
        ctx.beginPath();
        ctx.moveTo(x, gridY);
        ctx.lineTo(x, gridY + gridH);
        ctx.stroke();
    }
    
    // Draw horizontal lines (3 lines to divide into 4 rows)
    for (let i = 1; i < 4; i++) {
        const y = gridY + (i * cellH);
        ctx.beginPath();
        ctx.moveTo(gridX, y);
        ctx.lineTo(gridX + gridW, y);
        ctx.stroke();
    }
    
    // Draw cell numbers (optional, for easier identification)
    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < 16; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const cellX = gridX + (col * cellW) + (cellW / 2);
        const cellY = gridY + (row * cellH) + (cellH / 2);
        
        // Draw cell number with background for visibility
        ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
        ctx.fillRect(cellX - 15, cellY - 8, 30, 16);
        ctx.fillStyle = '#3498db';
        ctx.fillText((i + 1).toString(), cellX, cellY);
    }
}

/**
 * Extract words that fall within the detected grid bounds.
 */
function extractGridWords(ocrData, gridBounds) {
    const allWords = [];
    
    // Tesseract.js returns coordinates in the original image coordinate system
    // We should NOT scale - the bbox coordinates are already in image pixel coordinates
    // Use scale of 1.0 (no scaling)
    const finalScaleX = 1.0;
    const finalScaleY = 1.0;
    
    console.log('Image dimensions:', gridBounds.imageWidth, 'x', gridBounds.imageHeight);
    console.log('Grid bounds:', gridBounds.x, gridBounds.y, gridBounds.width, gridBounds.height);
    
    // Collect all words with their positions for debugging
    const allDetectedWords = [];
    
    for (const line of ocrData.lines || []) {
        for (const word of line.words || []) {
            const text = word.text.replace(/[^a-zA-Z0-9'-\s]/g, '').trim();
            if (text.length >= 2 && word.bbox) {
                // Scale OCR coordinates to original image coordinates
                const wordCenterX = ((word.bbox.x0 + word.bbox.x1) / 2) * finalScaleX;
                const wordCenterY = ((word.bbox.y0 + word.bbox.y1) / 2) * finalScaleY;
                
                allDetectedWords.push({
                    text: text.toUpperCase(),
                    centerX: wordCenterX,
                    centerY: wordCenterY,
                    bbox: word.bbox
                });
                
                // Check if word center falls within grid bounds
                const inGrid = (
                    wordCenterX >= gridBounds.x &&
                    wordCenterX <= gridBounds.x + gridBounds.width &&
                    wordCenterY >= gridBounds.y &&
                    wordCenterY <= gridBounds.y + gridBounds.height
                );
                
                if (inGrid) {
                    allWords.push({
                        text: text.toUpperCase(),
                        bbox: word.bbox,
                        confidence: word.confidence,
                        centerY: wordCenterY,
                        centerX: wordCenterX,
                        height: (word.bbox.y1 - word.bbox.y0) * finalScaleY
                    });
                }
            }
        }
    }
    
    console.log('Total words detected:', allDetectedWords.length);
    console.log('Words in grid:', allWords.length);
    if (allDetectedWords.length > 0 && allWords.length === 0) {
        console.warn('No words found in grid bounds! Sample word positions:', 
            allDetectedWords.slice(0, 5).map(w => `${w.text} at (${w.centerX.toFixed(0)}, ${w.centerY.toFixed(0)})`));
    }
    
    // Store detected words for debug visualization
    state.detectedWords = allDetectedWords;
    
    if (allWords.length === 0) return [];
    
    // Group words into rows and sort in reading order
    const rows = groupIntoRows(allWords);
    
    // Extract words in reading order (top to bottom, left to right)
    const gridWords = [];
    for (const row of rows) {
        // Sort row by X position (left to right)
        row.sort((a, b) => a.centerX - b.centerX);
        gridWords.push(...row.map(w => w.text));
    }
    
    return gridWords.slice(0, 16);
}

/**
 * Group words into rows based on their Y position
 */
function groupIntoRows(words) {
    if (words.length === 0) return [];
    
    const sorted = [...words].sort((a, b) => a.centerY - b.centerY);
    const rows = [];
    let currentRow = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
        const word = sorted[i];
        const prevWord = sorted[i - 1];
        
        // If Y difference is small, same row; otherwise new row
        // Use the height as a threshold for row grouping
        const threshold = prevWord.height * 0.8;
        
        if (Math.abs(word.centerY - prevWord.centerY) < threshold) {
            currentRow.push(word);
        } else {
            rows.push(currentRow);
            currentRow = [word];
        }
    }
    
    if (currentRow.length > 0) {
        rows.push(currentRow);
    }
    
    return rows;
}

function normalizeToGrid(words) {
    // Take first 16 words, or pad with placeholders
    const tiles = words.slice(0, 16);
    
    while (tiles.length < 16) {
        tiles.push(`WORD ${tiles.length + 1}`);
    }
    
    return tiles.map((word, index) => ({
        id: index,
        word: word,
        draftColor: null
    }));
}

function showManualEntry() {
    const input = prompt(
        'Enter 16 words separated by commas:',
        'WORD1, WORD2, WORD3, WORD4, WORD5, WORD6, WORD7, WORD8, WORD9, WORD10, WORD11, WORD12, WORD13, WORD14, WORD15, WORD16'
    );
    
    if (input) {
        const words = input.split(',')
            .map(w => w.trim().toUpperCase())
            .filter(w => w.length > 0);
        
        state.tiles = normalizeToGrid(words);
        elements.statusSection.hidden = true;
        elements.gridSection.hidden = false;
        renderGrid();
    } else {
        resetUpload();
    }
}

// ==================== Grid Rendering ====================

function renderGrid() {
    elements.tileGrid.innerHTML = '';
    
    state.tiles.forEach((tile, index) => {
        if (tile === null) {
            // Empty slot in grid
            const emptyEl = document.createElement('div');
            emptyEl.className = 'tile tile-empty';
            emptyEl.dataset.index = index;
            emptyEl.dataset.source = 'grid';
            emptyEl.addEventListener('dragover', handleDragOver);
            emptyEl.addEventListener('dragleave', handleDragLeave);
            emptyEl.addEventListener('drop', handleDrop);
            elements.tileGrid.appendChild(emptyEl);
        } else {
            const tileEl = createTileElement(tile, index, 'grid');
            elements.tileGrid.appendChild(tileEl);
        }
    });
    
    renderScratchpad();
    
    // Fit text to tiles after DOM update
    requestAnimationFrame(fitAllTileText);
    
    saveState();
}

function createTileElement(tile, index, source) {
    const tileEl = document.createElement('div');
    tileEl.className = 'tile';
    
    // Create inner span for text (allows measuring and scaling)
    const textSpan = document.createElement('span');
    textSpan.className = 'tile-text';
    textSpan.textContent = tile.word;
    tileEl.appendChild(textSpan);
    tileEl.dataset.index = index;
    tileEl.dataset.source = source;
    tileEl.draggable = true;
    
    if (tile.draftColor) {
        tileEl.dataset.draftColor = tile.draftColor;
    }
    
    // Check if tile is selected
    const key = `${source}:${index}`;
    if (state.selectedTiles.has(key)) {
        tileEl.classList.add('selected');
    }
    
    // Drag events for reordering
    tileEl.addEventListener('dragstart', handleDragStart);
    tileEl.addEventListener('dragend', handleDragEnd);
    tileEl.addEventListener('dragover', handleDragOver);
    tileEl.addEventListener('dragleave', handleDragLeave);
    tileEl.addEventListener('drop', handleDrop);
    
    // Click for tile selection
    tileEl.addEventListener('click', handleTileClick);
    
    // Touch drag and drop (mobile)
    tileEl.addEventListener('touchstart', handleTouchDragStart, { passive: false });
    tileEl.addEventListener('touchmove', handleTouchDragMove, { passive: false });
    tileEl.addEventListener('touchend', handleTouchDragEnd);
    tileEl.addEventListener('touchcancel', handleTouchDragEnd);
    
    return tileEl;
}

function renderScratchpad() {
    const slots = elements.scratchpad.querySelectorAll('.scratchpad-slot');
    
    slots.forEach((slot, index) => {
        slot.innerHTML = '';
        
        const tile = state.scratchpad[index];
        if (tile) {
            const tileEl = createTileElement(tile, index, 'scratchpad');
            slot.appendChild(tileEl);
        }
    });
}

/**
 * Fit text within all tiles by scaling down if needed
 */
function fitAllTileText() {
    const tiles = document.querySelectorAll('.tile:not(.tile-empty)');
    tiles.forEach(fitTileText);
}

/**
 * Scale down text to fit within a tile
 */
function fitTileText(tile) {
    const textSpan = tile.querySelector('.tile-text');
    if (!textSpan) return;
    
    // Reset any previous scaling to measure true size
    textSpan.style.transform = 'none';
    
    // Get computed padding
    const styles = getComputedStyle(tile);
    const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    
    const availableWidth = tile.clientWidth - paddingX;
    const availableHeight = tile.clientHeight - paddingY;
    const textWidth = textSpan.offsetWidth;
    const textHeight = textSpan.offsetHeight;
    
    // Calculate scale needed to fit (with small buffer)
    const scaleX = (availableWidth - 4) / textWidth;
    const scaleY = (availableHeight - 2) / textHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Never scale up, only down
    
    if (scale < 0.99) {
        textSpan.style.transform = `scale(${scale})`;
    } else {
        textSpan.style.transform = '';
    }
}

// ==================== Drag and Drop ====================

let dragStyleTimeout = null;

function handleDragStart(e) {
    // Cancel any pending long press
    handleTilePressCancel();
    
    state.draggedTile = e.target;
    state.draggedSource = e.target.dataset.source;
    
    // Delay adding dragging class to avoid flicker on click
    dragStyleTimeout = setTimeout(() => {
        if (state.draggedTile) {
            state.draggedTile.classList.add('dragging');
        }
    }, 50);
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
        index: parseInt(e.target.dataset.index),
        source: e.target.dataset.source
    }));
}

function handleDragEnd(e) {
    // Clear the timeout if drag ends quickly
    if (dragStyleTimeout) {
        clearTimeout(dragStyleTimeout);
        dragStyleTimeout = null;
    }
    e.target.classList.remove('dragging');
    state.draggedTile = null;
    state.draggedSource = null;
    
    // Remove all drag-over states
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.target.closest('.tile, .tile-empty, .scratchpad-slot');
    if (target && target !== state.draggedTile) {
        target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    e.target.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    
    // Find the drop target
    let target = e.target.closest('.tile, .tile-empty, .scratchpad-slot');
    if (!target) return;
    
    target.classList.remove('drag-over');
    
    // Get source info
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const fromIndex = data.index;
    const fromSource = data.source;
    
    // Determine target info
    let toIndex, toSource;
    
    if (target.classList.contains('scratchpad-slot')) {
        toIndex = parseInt(target.dataset.slot);
        toSource = 'scratchpad';
    } else {
        toIndex = parseInt(target.dataset.index);
        toSource = target.dataset.source;
    }
    
    // Don't drop on self
    if (fromSource === toSource && fromIndex === toIndex) return;
    
    // Get the tiles
    const fromTile = fromSource === 'grid' ? state.tiles[fromIndex] : state.scratchpad[fromIndex];
    const toTile = toSource === 'grid' ? state.tiles[toIndex] : state.scratchpad[toIndex];
    
    // Update selection to follow the tiles
    const fromKey = `${fromSource}:${fromIndex}`;
    const toKey = `${toSource}:${toIndex}`;
    const fromWasSelected = state.selectedTiles.has(fromKey);
    const toWasSelected = state.selectedTiles.has(toKey);
    
    // Remove old keys
    state.selectedTiles.delete(fromKey);
    state.selectedTiles.delete(toKey);
    
    // Add new keys based on where the tiles moved to
    if (fromWasSelected) {
        state.selectedTiles.add(toKey);
    }
    if (toWasSelected) {
        state.selectedTiles.add(fromKey);
    }
    
    // Swap or move
    if (fromSource === 'grid') {
        state.tiles[fromIndex] = toTile;
    } else {
        state.scratchpad[fromIndex] = toTile;
    }
    
    if (toSource === 'grid') {
        state.tiles[toIndex] = fromTile;
    } else {
        state.scratchpad[toIndex] = fromTile;
    }
    
    renderGrid();
}

// ==================== Touch Drag and Drop (Mobile) ====================

const DRAG_THRESHOLD = 10; // Pixels to move before drag starts

let touchDragState = {
    pending: false,    // Touch started, waiting to see if it's a drag
    dragging: false,   // Actually dragging
    element: null,
    clone: null,
    source: null,
    index: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
};

function handleTouchDragStart(e) {
    const tile = e.target.closest('.tile:not(.tile-empty)');
    if (!tile) return;
    
    const touch = e.touches[0];
    const rect = tile.getBoundingClientRect();
    
    // Just record the start position - don't start dragging yet
    touchDragState = {
        pending: true,
        dragging: false,
        element: tile,
        clone: null,
        source: tile.dataset.source,
        index: parseInt(tile.dataset.index),
        startX: touch.clientX,
        startY: touch.clientY,
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top
    };
    
    // Don't prevent default here - allow click to work for taps
}

function startActualDrag() {
    if (!touchDragState.element) return;
    
    // Cancel long press timer
    handleTilePressCancel();
    
    touchDragState.dragging = true;
    touchDragState.pending = false;
    
    const tile = touchDragState.element;
    const rect = tile.getBoundingClientRect();
    
    // Create a visual clone for dragging
    const clone = tile.cloneNode(true);
    clone.classList.add('touch-drag-clone');
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    document.body.appendChild(clone);
    touchDragState.clone = clone;
    
    tile.classList.add('dragging');
}

function handleTouchDragMove(e) {
    if (!touchDragState.pending && !touchDragState.dragging) return;
    
    const touch = e.touches[0];
    
    // Check if we should start dragging (movement threshold)
    if (touchDragState.pending && !touchDragState.dragging) {
        const dx = touch.clientX - touchDragState.startX;
        const dy = touch.clientY - touchDragState.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance >= DRAG_THRESHOLD) {
            startActualDrag();
        } else {
            return; // Not moved enough yet
        }
    }
    
    if (!touchDragState.clone) return;
    
    // Move the clone
    touchDragState.clone.style.left = (touch.clientX - touchDragState.offsetX) + 'px';
    touchDragState.clone.style.top = (touch.clientY - touchDragState.offsetY) + 'px';
    
    // Find element under touch point
    touchDragState.clone.style.pointerEvents = 'none';
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    touchDragState.clone.style.pointerEvents = '';
    
    // Clear previous drag-over states
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    
    // Highlight drop target
    if (elementBelow) {
        const dropTarget = elementBelow.closest('.tile, .tile-empty, .scratchpad-slot');
        if (dropTarget && dropTarget !== touchDragState.element) {
            dropTarget.classList.add('drag-over');
        }
    }
    
    e.preventDefault();
}

function handleTouchDragEnd(e) {
    // If it was just a pending touch (tap), allow click to happen
    if (touchDragState.pending && !touchDragState.dragging) {
        touchDragState.pending = false;
        touchDragState.element = null;
        return; // Let the click event fire
    }
    
    if (!touchDragState.dragging) return;
    
    // Find drop target
    const touch = e.changedTouches[0];
    if (touchDragState.clone) {
        touchDragState.clone.style.pointerEvents = 'none';
    }
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Clean up
    if (touchDragState.clone) {
        touchDragState.clone.remove();
    }
    if (touchDragState.element) {
        touchDragState.element.classList.remove('dragging');
    }
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    
    // Handle drop
    if (elementBelow) {
        const dropTarget = elementBelow.closest('.tile, .tile-empty, .scratchpad-slot');
        if (dropTarget && dropTarget !== touchDragState.element) {
            performSwap(
                touchDragState.source,
                touchDragState.index,
                dropTarget
            );
        }
    }
    
    touchDragState.pending = false;
    touchDragState.dragging = false;
    touchDragState.element = null;
    touchDragState.clone = null;
}

function performSwap(fromSource, fromIndex, targetElement) {
    let toIndex, toSource;
    
    if (targetElement.classList.contains('scratchpad-slot')) {
        toIndex = parseInt(targetElement.dataset.slot);
        toSource = 'scratchpad';
    } else {
        toIndex = parseInt(targetElement.dataset.index);
        toSource = targetElement.dataset.source;
    }
    
    // Don't drop on self
    if (fromSource === toSource && fromIndex === toIndex) return;
    
    // Get the tiles
    const fromTile = fromSource === 'grid' ? state.tiles[fromIndex] : state.scratchpad[fromIndex];
    const toTile = toSource === 'grid' ? state.tiles[toIndex] : state.scratchpad[toIndex];
    
    // Update selection to follow the tiles
    const fromKey = `${fromSource}:${fromIndex}`;
    const toKey = `${toSource}:${toIndex}`;
    const fromWasSelected = state.selectedTiles.has(fromKey);
    const toWasSelected = state.selectedTiles.has(toKey);
    
    // Remove old keys
    state.selectedTiles.delete(fromKey);
    state.selectedTiles.delete(toKey);
    
    // Add new keys based on where the tiles moved to
    if (fromWasSelected) {
        state.selectedTiles.add(toKey);
    }
    if (toWasSelected) {
        state.selectedTiles.add(fromKey);
    }
    
    // Swap or move
    if (fromSource === 'grid') {
        state.tiles[fromIndex] = toTile;
    } else {
        state.scratchpad[fromIndex] = toTile;
    }
    
    if (toSource === 'grid') {
        state.tiles[toIndex] = fromTile;
    } else {
        state.scratchpad[toIndex] = fromTile;
    }
    
    renderGrid();
}

// ==================== Scratchpad ====================

function setupScratchpad() {
    const slots = elements.scratchpad.querySelectorAll('.scratchpad-slot');
    
    slots.forEach(slot => {
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('dragleave', handleDragLeave);
        slot.addEventListener('drop', handleDrop);
    });
    
    // Send back button - return all scratchpad tiles to empty grid slots
    const sendBackBtn = document.getElementById('sendBackBtn');
    sendBackBtn.addEventListener('click', sendScratchpadBack);
}

function sendScratchpadBack() {
    // Find empty slots in the grid
    const emptySlots = [];
    state.tiles.forEach((tile, index) => {
        if (tile === null) {
            emptySlots.push(index);
        }
    });
    
    // Move scratchpad tiles to empty grid slots
    let emptyIndex = 0;
    for (let i = 0; i < state.scratchpad.length; i++) {
        if (state.scratchpad[i] && emptyIndex < emptySlots.length) {
            const fromKey = `scratchpad:${i}`;
            const toKey = `grid:${emptySlots[emptyIndex]}`;
            
            // Update selection if this tile was selected
            if (state.selectedTiles.has(fromKey)) {
                state.selectedTiles.delete(fromKey);
                state.selectedTiles.add(toKey);
            }
            
            state.tiles[emptySlots[emptyIndex]] = state.scratchpad[i];
            state.scratchpad[i] = null;
            emptyIndex++;
        }
    }
    
    renderGrid();
}

// ==================== Color Palette ====================

function setupColorPalette() {
    elements.colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            
            // Apply color to all selected tiles
            if (state.selectedTiles.size === 0) return;
            
            // Check if all selected tiles already have this color (for toggle behavior)
            let allSameColor = true;
            for (const key of state.selectedTiles) {
                const [source, index] = key.split(':');
                const tile = source === 'grid' ? state.tiles[parseInt(index)] : state.scratchpad[parseInt(index)];
                if (tile && tile.draftColor !== color) {
                    allSameColor = false;
                    break;
                }
            }
            
            // Apply or clear the color
            for (const key of state.selectedTiles) {
                const [source, index] = key.split(':');
                const tile = source === 'grid' ? state.tiles[parseInt(index)] : state.scratchpad[parseInt(index)];
                if (tile) {
                    if (color === 'none' || allSameColor) {
                        tile.draftColor = null;
                    } else {
                        tile.draftColor = color;
                    }
                }
            }
            
            // Keep selection after applying color
            renderGrid();
        });
    });
}

function handleTileClick(e) {
    const tileEl = e.target.closest('.tile');
    if (!tileEl || tileEl.classList.contains('tile-empty')) return;
    
    const source = tileEl.dataset.source;
    const index = parseInt(tileEl.dataset.index);
    const key = `${source}:${index}`;
    
    // Toggle selection
    if (state.selectedTiles.has(key)) {
        state.selectedTiles.delete(key);
        tileEl.classList.remove('selected');
    } else {
        state.selectedTiles.add(key);
        tileEl.classList.add('selected');
    }
}

// Long press handling for definitions
const LONG_PRESS_DURATION = 500; // ms
let longPressTimer = null;
let longPressTriggered = false;

function handleTilePressStart(e) {
    longPressTriggered = false;
    const target = e.target.closest('.tile');
    if (!target || target.classList.contains('tile-empty')) return;
    
    const source = target.dataset.source;
    const index = parseInt(target.dataset.index);
    const tile = source === 'grid' ? state.tiles[index] : state.scratchpad[index];
    
    if (!tile) return;
    
    longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        showDefinition(tile.word);
    }, LONG_PRESS_DURATION);
}

function handleTilePressEnd(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

function handleTilePressCancel(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

// ==================== Shuffle ====================

function setupShuffleButton() {
    elements.shuffleBtn.addEventListener('click', () => {
        // Track which tiles are selected before shuffle
        const selectedTileObjects = new Set();
        for (const key of state.selectedTiles) {
            const [source, index] = key.split(':');
            if (source === 'grid') {
                const tile = state.tiles[parseInt(index)];
                if (tile) selectedTileObjects.add(tile);
            }
        }
        
        // Remove grid selections (scratchpad stays the same)
        for (const key of [...state.selectedTiles]) {
            if (key.startsWith('grid:')) {
                state.selectedTiles.delete(key);
            }
        }
        
        // Fisher-Yates shuffle
        for (let i = state.tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.tiles[i], state.tiles[j]] = [state.tiles[j], state.tiles[i]];
        }
        
        // Re-add selections at new positions
        state.tiles.forEach((tile, index) => {
            if (tile && selectedTileObjects.has(tile)) {
                state.selectedTiles.add(`grid:${index}`);
            }
        });
        
        renderGrid();
    });
}

// ==================== Definition Modal ====================

function setupModal() {
    elements.modalClose.addEventListener('click', closeModal);
    
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) {
            closeModal();
        }
    });
    
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeHelpModal();
        }
    });
}

function closeModal() {
    elements.modal.hidden = true;
}

function setupHelpModal() {
    elements.helpBtn.addEventListener('click', () => {
        elements.helpModal.hidden = false;
    });
    
    elements.helpModalClose.addEventListener('click', closeHelpModal);
    
    elements.helpModal.addEventListener('click', (e) => {
        if (e.target === elements.helpModal) {
            closeHelpModal();
        }
    });
}

function setupDebugToggle() {
    if (!elements.debugToggle) return;
    
    elements.debugToggle.addEventListener('click', () => {
        state.debugVisible = !state.debugVisible;
        
        // Show/hide preview container and both image/canvas together
        // When debug is ON: show all, when OFF: hide all
        elements.previewContainer.hidden = !state.debugVisible;
        elements.previewImage.hidden = !state.debugVisible;
        elements.debugCanvas.hidden = !state.debugVisible;
        
        // Redraw debug overlay if we have grid bounds stored and debug is visible
        if (state.debugVisible && state.lastGridBounds) {
            drawDebugOverlay(state.lastGridBounds);
        }
    });
    
    // Initialize canvas as hidden (preview image will be shown when file is loaded)
    elements.debugCanvas.hidden = true;
}

function closeHelpModal() {
    elements.helpModal.hidden = true;
}

async function showDefinition(word) {
    elements.modal.hidden = false;
    elements.modalWord.textContent = word.toLowerCase();
    elements.modalDefinition.innerHTML = '<div class="loading">Loading definition...</div>';
    
    try {
        // Use the free Dictionary API
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
        
        if (!response.ok) {
            throw new Error('Word not found');
        }
        
        const data = await response.json();
        displayDefinitions(data[0]);
        
    } catch (error) {
        elements.modalDefinition.innerHTML = `
            <div class="error">
                <p>Definition not found for "${word}".</p>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">
                    This might be a proper noun, abbreviation, or specialized term.
                </p>
            </div>
        `;
    }
}

function displayDefinitions(entry) {
    let html = '';
    
    // Phonetic
    if (entry.phonetic) {
        html += `<p style="color: var(--text-muted); margin-bottom: 1rem; font-family: var(--font-mono);">${entry.phonetic}</p>`;
    }
    
    // Meanings
    entry.meanings.forEach(meaning => {
        html += '<div class="definition-item">';
        html += `<p class="part-of-speech">${meaning.partOfSpeech}</p>`;
        
        // Show up to 3 definitions per part of speech
        meaning.definitions.slice(0, 3).forEach((def, i) => {
            html += `<p class="meaning">${i + 1}. ${def.definition}</p>`;
            if (def.example) {
                html += `<p style="color: var(--text-muted); font-style: italic; margin-left: 1rem; margin-top: 0.25rem;">"${def.example}"</p>`;
            }
        });
        
        html += '</div>';
    });
    
    elements.modalDefinition.innerHTML = html;
}

// ==================== Start App ====================

init();

// Refit text on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(fitAllTileText, 100);
});

