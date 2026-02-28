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
    viewDate: null, // YYYY-MM-DD of the puzzle currently displayed
};

// DOM Elements
const elements = {
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
    helpModalClose: document.getElementById('helpModalClose'),
    dateLabel: document.getElementById('dateLabel'),
    prevDayBtn: document.getElementById('prevDayBtn'),
    nextDayBtn: document.getElementById('nextDayBtn'),
};

const STORAGE_PREFIX = 'wellconnected_';

function storageKeyForDate(date) {
    return `${STORAGE_PREFIX}${date}`;
}

// Initialize
function init() {
    setupColorPalette();
    setupShuffleButton();
    setupModal();
    setupHelpModal();
    setupScratchpad();
    setupDateNav();
    loadWordsForDate(todayDate());
}

// ==================== Local Storage ====================

function saveState() {
    if (!state.viewDate) return;
    const data = {
        tiles: state.tiles,
        scratchpad: state.scratchpad
    };
    localStorage.setItem(storageKeyForDate(state.viewDate), JSON.stringify(data));
}

function getSavedStateForDate(date) {
    try {
        const saved = localStorage.getItem(storageKeyForDate(date));
        if (!saved) return null;
        const data = JSON.parse(saved);
        if (Array.isArray(data.tiles) && data.tiles.length === 16) {
            return data;
        }
    } catch (e) {
        console.error('Failed to load saved state:', e);
    }
    return null;
}

function clearSavedState(date) {
    localStorage.removeItem(storageKeyForDate(date));
}

// ==================== Date Navigation ====================

const wordCache = {}; // date string -> words array

function todayDate() {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function shiftDate(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA');
}

function urlForDate(date) {
    return `archive/${date}.json`;
}

async function fetchWordsForDate(date) {
    if (wordCache[date] === null) throw new Error('No puzzle available for this date');
    if (wordCache[date]) return wordCache[date];
    const res = await fetch(urlForDate(date), { cache: 'no-cache' });
    if (!res.ok) {
        wordCache[date] = null;
        throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.words) || data.words.length !== 16) throw new Error('Invalid words in puzzle file');
    wordCache[date] = data.words;
    return data.words;
}

async function dateFileExists(date) {
    if (wordCache[date]) return true;
    if (wordCache[date] === null) return false;
    try {
        const res = await fetch(urlForDate(date), { method: 'HEAD' });
        if (!res.ok) wordCache[date] = null;
        return res.ok;
    } catch {
        return false;
    }
}

function setupDateNav() {
    elements.prevDayBtn.addEventListener('click', () => {
        loadWordsForDate(shiftDate(state.viewDate, -1));
    });
    elements.nextDayBtn.addEventListener('click', () => {
        loadWordsForDate(shiftDate(state.viewDate, 1));
    });
}

async function updateDateNav() {
    const date = state.viewDate;
    const today = todayDate();

    const d = new Date(`${date}T00:00:00`);
    const isToday = date === today;
    elements.dateLabel.textContent = isToday
        ? `Today, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
        : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const [hasPrev, hasNext] = await Promise.all([
        dateFileExists(shiftDate(date, -1)),
        isToday ? Promise.resolve(false) : dateFileExists(shiftDate(date, 1)),
    ]);
    elements.prevDayBtn.style.visibility = hasPrev ? 'visible' : 'hidden';
    elements.nextDayBtn.style.visibility = hasNext ? 'visible' : 'hidden';
}

async function loadWordsForDate(date) {
    const cached = !!wordCache[date] || !!getSavedStateForDate(date);
    if (!cached) {
        elements.statusSection.hidden = false;
        elements.statusSection.querySelector('.spinner').hidden = false;
        elements.statusText.textContent = 'Loading puzzle...';
        elements.gridSection.hidden = true;
    }

    try {
        const words = await fetchWordsForDate(date);
        const saved = getSavedStateForDate(date);
        if (saved) {
            state.tiles = saved.tiles;
            state.scratchpad = saved.scratchpad || [null, null, null, null];
        } else {
            state.tiles = normalizeToGrid(words);
            state.scratchpad = [null, null, null, null];
        }

        state.viewDate = date;
        elements.statusSection.hidden = true;
        elements.gridSection.hidden = false;
        renderGrid();
        updateDateNav();
    } catch (err) {
        elements.statusSection.querySelector('.spinner').hidden = true;
        elements.statusText.textContent = `Couldn't load puzzle for ${date}. ${err.message}`;
    }
}

// ==================== Grid Utilities ====================

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
 * Scale down text to fit within a tile (text wraps naturally; only height is checked)
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
    
    // scrollWidth detects horizontal overflow from long non-wrapping words
    const scaleX = availableWidth / textSpan.scrollWidth;
    const scaleY = (availableHeight - 4) / textSpan.offsetHeight;
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

