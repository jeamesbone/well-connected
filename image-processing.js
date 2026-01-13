/**
 * Image Processing and Grid Detection
 * Handles image preprocessing and grid boundary detection
 */

/**
 * Extract a single cell from a grid image
 * Returns a blob containing the cell image
 */
async function extractCell(blob, cellIndex, gridWidth, gridHeight) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        const processImage = () => {
            // Calculate cell position (4x4 grid, reading order: top to bottom, left to right)
            const row = Math.floor(cellIndex / 4);
            const col = cellIndex % 4;
            const cellWidth = gridWidth / 4;
            const cellHeight = gridHeight / 4;
            
            const cellX = col * cellWidth;
            const cellY = row * cellHeight;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set canvas size to the cell dimensions
            canvas.width = cellWidth;
            canvas.height = cellHeight;
            
            // Draw the cell portion of the image
            ctx.drawImage(
                img,
                cellX, cellY, cellWidth, cellHeight, // Source rectangle
                0, 0, cellWidth, cellHeight // Destination rectangle
            );
            
            // Convert to blob
            canvas.toBlob((cellBlob) => {
                if (cellBlob) {
                    resolve(cellBlob);
                } else {
                    reject(new Error(`Failed to extract cell ${cellIndex}`));
                }
            }, 'image/png');
        };
        
        img.onerror = () => reject(new Error('Failed to load image for cell extraction'));
        
        // Load image from blob
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => {
            processImage();
            URL.revokeObjectURL(objectUrl);
        };
        img.src = objectUrl;
    });
}

/**
 * Crop an image blob to the specified bounds
 * Returns a new blob containing the cropped image
 */
async function cropImage(blob, bounds) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        const processImage = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set canvas size to the crop dimensions
            canvas.width = bounds.width;
            canvas.height = bounds.height;
            
            // Draw the cropped portion of the image
            ctx.drawImage(
                img,
                bounds.x, bounds.y, bounds.width, bounds.height, // Source rectangle
                0, 0, bounds.width, bounds.height // Destination rectangle
            );
            
            // Convert to blob
            canvas.toBlob((croppedBlob) => {
                if (croppedBlob) {
                    resolve(croppedBlob);
                } else {
                    reject(new Error('Failed to crop image'));
                }
            }, 'image/png');
        };
        
        img.onerror = () => reject(new Error('Failed to load image for cropping'));
        
        // Load image from blob
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => {
            processImage();
            URL.revokeObjectURL(objectUrl);
        };
        img.src = objectUrl;
    });
}

/**
 * Preprocess image to convert dark mode to light mode for better OCR
 * Returns both a blob (for Tesseract) and a data URL (for preview)
 */
async function preprocessImageForOCR(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw original image
            ctx.drawImage(img, 0, 0);
            
            // Get image data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // Sample background color to determine if image is dark mode
            const bgColor = sampleBackgroundColor(pixels, width, height);
            const isDarkMode = bgColor.brightness < 0.5;
            
            console.log('Image preprocessing - Background brightness:', bgColor.brightness, 'Dark mode:', isDarkMode);
            
            // If dark mode, invert the entire image
            // This converts dark backgrounds to light, and light text to dark
            if (isDarkMode) {
                for (let i = 0; i < pixels.length; i += 4) {
                    // Invert all colors
                    pixels[i] = 255 - pixels[i];     // Red
                    pixels[i + 1] = 255 - pixels[i + 1]; // Green
                    pixels[i + 2] = 255 - pixels[i + 2]; // Blue
                    // Alpha channel stays the same
                }
            }
            
            // Put processed image data back
            ctx.putImageData(imageData, 0, 0);
            
            // Get data URL for preview
            const dataUrl = canvas.toDataURL('image/png');
            
            // Convert canvas to blob for Tesseract
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve({ blob, dataUrl });
                } else {
                    reject(new Error('Failed to convert canvas to blob'));
                }
            }, 'image/png');
        };
        
        img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
        
        // Load image from file
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Detect the grid region by analyzing tile background colors.
 * Works by finding areas that differ from the page background.
 * Returns bounding box { x, y, width, height } of the grid area.
 * Accepts either a File or a Blob.
 */
async function detectGridBounds(fileOrBlob) {
    return new Promise((resolve) => {
        const img = new Image();
        
        const processImage = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // Sample background color from corners
            const bgColor = sampleBackgroundColor(pixels, width, height);
            console.log('Detected background color:', bgColor);
            
            // Create a grid to track which areas have background color
            // Use larger cells to filter out small elements like circles/dots
            const cellSize = 40; // 20x20 pixel cells - larger than UI dots but smaller than tiles
            const gridW = Math.ceil(width / cellSize);
            const gridH = Math.ceil(height / cellSize);
            const bgCount = new Array(gridW * gridH).fill(0); // Count of background pixels per cell
            
            // Count BACKGROUND pixels in each cell
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    
                    // Count pixels that ARE the background color
                    if (!isDifferentFromBackground(r, g, b, bgColor)) {
                        const cellX = Math.floor(x / cellSize);
                        const cellY = Math.floor(y / cellSize);
                        bgCount[cellY * gridW + cellX]++;
                    }
                }
            }
            
            // Find cells that are mostly tile (not background)
            // Use adaptive threshold based on background brightness
            const filledCells = [];
            const pixelsPerCell = cellSize * cellSize;
            // Light mode needs more lenient threshold due to anti-aliasing and subtle differences
            const backgroundThresholdPercent = bgColor.brightness > 0.7 ? 0.15 : 0.05; // 15% for light, 5% for dark
            const backgroundThreshold = pixelsPerCell * backgroundThresholdPercent;
            
            for (let cy = 0; cy < gridH; cy++) {
                for (let cx = 0; cx < gridW; cx++) {
                    const bgPixelCount = bgCount[cy * gridW + cx];
                    // Cell is "filled" if it has few background pixels
                    if (bgPixelCount < backgroundThreshold) {
                        filledCells.push({ x: cx, y: cy });
                    }
                }
            }
            
            console.log('Found filled cells:', filledCells.length);
            
            if (filledCells.length === 0) {
                // Fallback: return full image bounds
                resolve({ x: 0, y: 0, width, height, imageWidth: width, imageHeight: height });
                return;
            }
            
            // Filter out isolated cells (like PiP UI) that are far from the main cluster
            const filteredCells = filterOutliers(filledCells);
            console.log('Filtered cells (removed outliers):', filteredCells.length);
            
            if (filteredCells.length === 0) {
                // If filtering removed everything, use original cells
                console.warn('Filtering removed all cells, using original');
                var cellsToUse = filledCells;
            } else {
                var cellsToUse = filteredCells;
            }
            
            // Find bounding box of filtered filled cells
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            
            for (const cell of cellsToUse) {
                minX = Math.min(minX, cell.x);
                minY = Math.min(minY, cell.y);
                maxX = Math.max(maxX, cell.x);
                maxY = Math.max(maxY, cell.y);
            }
            
            // Convert back to pixel coordinates
            const pixelMinX = minX * cellSize;
            const pixelMinY = minY * cellSize;
            const pixelMaxX = (maxX + 1) * cellSize;
            const pixelMaxY = (maxY + 1) * cellSize;
            
            resolve({
                x: pixelMinX,
                y: pixelMinY,
                width: pixelMaxX - pixelMinX,
                height: pixelMaxY - pixelMinY,
            });
        };
        
        // Load image from file or blob
        // If it's already a blob, create object URL; otherwise use FileReader
        if (fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)) {
            // It's a blob, create object URL
            const objectUrl = URL.createObjectURL(fileOrBlob);
            img.onload = () => {
                processImage();
                URL.revokeObjectURL(objectUrl); // Clean up after loading
            };
            img.src = objectUrl;
        } else {
            // It's a File, use FileReader
            img.onload = processImage;
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.readAsDataURL(fileOrBlob);
        }
    });
}

/**
 * Sample the background color from the four corners only
 * Uses a larger sample tile size for better accuracy
 * Returns the most common color (not average)
 */
function sampleBackgroundColor(pixels, width, height) {
    const cornerSize = 80; // Larger sample tile size for corners
    const colorMap = new Map(); // For histogram approach
    
    // Sample from each of the four corners
    const corners = [
        { x: 0, y: 0 },                                    // Top-left
        { x: width - cornerSize, y: 0 },                  // Top-right
        { x: 0, y: height - cornerSize },                 // Bottom-left
        { x: width - cornerSize, y: height - cornerSize }  // Bottom-right
    ];
    
    for (const corner of corners) {
        for (let dy = 0; dy < cornerSize; dy++) {
            for (let dx = 0; dx < cornerSize; dx++) {
                const x = corner.x + dx;
                const y = corner.y + dy;
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    const i = (y * width + x) * 4;
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    
                    // Quantize colors to reduce noise (round to nearest 8 for better grouping)
                    const qr = Math.round(r / 8) * 8;
                    const qg = Math.round(g / 8) * 8;
                    const qb = Math.round(b / 8) * 8;
                    const key = `${qr},${qg},${qb}`;
                    
                    colorMap.set(key, (colorMap.get(key) || 0) + 1);
                }
            }
        }
    }
    
    // Find the most common color (background should be most frequent)
    let maxCount = 0;
    let dominantColor = null;
    for (const [key, count] of colorMap.entries()) {
        if (count > maxCount) {
            maxCount = count;
            const [r, g, b] = key.split(',').map(Number);
            dominantColor = { r, g, b };
        }
    }
    
    // Fallback to white if no color found
    if (!dominantColor) {
        dominantColor = { r: 255, g: 255, b: 255 };
    }
    
    // Calculate brightness for adaptive threshold
    dominantColor.brightness = (dominantColor.r * 0.299 + dominantColor.g * 0.587 + dominantColor.b * 0.114) / 255;
    
    return dominantColor;
}

/**
 * Filter out isolated cells that are far from the main cluster
 * This removes UI elements like PiP windows that are separate from the grid
 */
function filterOutliers(cells) {
    if (cells.length === 0) return cells;
    
    // If we have very few cells, don't filter (might be a small grid or detection issue)
    if (cells.length < 10) return cells;
    
    // Find the center of mass of all cells
    let sumX = 0, sumY = 0;
    for (const cell of cells) {
        sumX += cell.x;
        sumY += cell.y;
    }
    const centerX = sumX / cells.length;
    const centerY = sumY / cells.length;
    
    // Calculate distances from center for each cell
    const distances = cells.map(cell => {
        const dx = cell.x - centerX;
        const dy = cell.y - centerY;
        return {
            cell,
            distance: Math.sqrt(dx * dx + dy * dy)
        };
    });
    
    // Sort by distance
    distances.sort((a, b) => a.distance - b.distance);
    
    // Find the median distance (middle value)
    const medianIndex = Math.floor(distances.length / 2);
    const medianDistance = distances[medianIndex].distance;
    
    // Calculate a threshold: cells within 2.5x the median distance are considered part of the main cluster
    // This should capture the grid while excluding isolated UI elements
    const threshold = medianDistance * 2.5;
    
    // Filter to only include cells within the threshold
    const filtered = distances
        .filter(d => d.distance <= threshold)
        .map(d => d.cell);
    
    // Safety check: if filtering removed more than 40% of cells, it's probably too aggressive
    // Return original cells in that case
    if (filtered.length < cells.length * 0.6) {
        console.warn('Outlier filtering removed too many cells, using original');
        return cells;
    }
    
    return filtered;
}

/**
 * Check if a pixel color is significantly different from the background
 * Uses adaptive threshold based on background brightness for better dark mode support
 */
function isDifferentFromBackground(r, g, b, bgColor) {
    // Calculate color distance
    const dr = r - bgColor.r;
    const dg = g - bgColor.g;
    const db = b - bgColor.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    
    // Calculate brightness of this pixel
    const pixelBrightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    
    // Adaptive threshold based on background brightness
    // Dark backgrounds (dark mode) need lower threshold to detect lighter tiles
    // Light backgrounds need lower threshold too - tiles are often only slightly different
    let threshold;
    if (bgColor.brightness < 0.3) {
        // Dark mode: use much lower threshold to catch subtle differences
        threshold = 12;
    } else if (bgColor.brightness < 0.7) {
        // Medium brightness: standard threshold
        threshold = 25;
    } else {
        // Light mode: use lower threshold - tiles are often only slightly darker than white background
        threshold = 20;
    }
    
    // Also check brightness difference for better detection
    const brightnessDiff = Math.abs(pixelBrightness - bgColor.brightness);
    // Adaptive brightness threshold
    let minBrightnessDiff;
    if (bgColor.brightness < 0.3) {
        // Dark mode: tiles can be only slightly brighter
        minBrightnessDiff = 0.08;
    } else if (bgColor.brightness < 0.7) {
        // Medium: standard threshold
        minBrightnessDiff = 0.1;
    } else {
        // Light mode: tiles can be only slightly darker than white background
        minBrightnessDiff = 0.05;
    }
    
    // Use OR logic for all modes - be more lenient to catch subtle differences
    return distance > threshold || brightnessDiff > minBrightnessDiff;
}

