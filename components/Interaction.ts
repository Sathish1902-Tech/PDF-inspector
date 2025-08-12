
// @ts-nocheck
import * as dom from './dom.js';
import { state } from './state.js';
import { getCanvasMousePos, parseFontNameDetails } from './utils.js';
import { updateToolStateUI } from './tools.js';
import * as sm from './SelectionManager.js';
import { redrawCurrentPageOverlay } from './PdfRenderer.js';
import { handleZoomChange } from './zoom.js';
import { PAGE_SCROLL_DEBOUNCE_MS } from './types.js';
import { resetFontInspectorProperties } from './FontInspector.js';

const MAGNIFIER_SIZE = 150; // Loupe diameter in pixels
const MAGNIFIER_ZOOM = 3;   // Magnification level

let magnifierCtx = null;

function initMagnifier() {
    if (dom.magnifierCanvas) {
        dom.magnifierCanvas.width = MAGNIFIER_SIZE;
        dom.magnifierCanvas.height = MAGNIFIER_SIZE;
        magnifierCtx = dom.magnifierCanvas.getContext('2d');
        if (magnifierCtx) {
            // Use false for crisp, pixelated zoom, true for smooth zoom
            magnifierCtx.imageSmoothingEnabled = false;
        }
    }
}

function showMagnifier() {
    if (!magnifierCtx) initMagnifier();
    if (dom.magnifierLoupe) {
        dom.magnifierLoupe.classList.remove('hidden');
    }
}

function hideMagnifier() {
    if (dom.magnifierLoupe) {
        dom.magnifierLoupe.classList.add('hidden');
    }
}

function updateMagnifier(e, pageNum) {
    if (!magnifierCtx || !state.pageCanvases[pageNum]) return;

    const { pdfCanvas } = state.pageCanvases[pageNum];
    const posOnCanvas = getCanvasMousePos(e, pdfCanvas);

    // Position the loupe element, offset from the cursor
    const LOUPE_OFFSET = 25;
    dom.magnifierLoupe.style.left = `${e.clientX + LOUPE_OFFSET}px`;
    dom.magnifierLoupe.style.top = `${e.clientY + LOUPE_OFFSET}px`;
    
    // Clear the magnifier canvas
    magnifierCtx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    
    // Define the source area on the main PDF canvas
    const sourceSize = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;
    const sourceX = posOnCanvas.x - sourceSize / 2;
    const sourceY = posOnCanvas.y - sourceSize / 2;

    // Draw the magnified image from the PDF canvas (not the overlay)
    magnifierCtx.drawImage(
        pdfCanvas,
        sourceX, sourceY, sourceSize, sourceSize, // source rect
        0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE     // destination rect
    );

    // Draw a crosshair in the center of the loupe for precision
    magnifierCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    magnifierCtx.lineWidth = 1;
    magnifierCtx.beginPath();
    // Horizontal line
    magnifierCtx.moveTo(0, MAGNIFIER_SIZE / 2);
    magnifierCtx.lineTo(MAGNIFIER_SIZE, MAGNIFIER_SIZE / 2);
    // Vertical line
    magnifierCtx.moveTo(MAGNIFIER_SIZE / 2, 0);
    magnifierCtx.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE);
    magnifierCtx.stroke();
}


// --- INTERACTION HANDLERS ---

export function initInteractions() {
    dom.pdfPagesContainer?.addEventListener('wheel', wheelHandler, { passive: false });
    dom.fontInspectorPdfContainer?.addEventListener('wheel', wheelHandler, { passive: false });
}

export const createMouseDownHandler = (pageNum) => async (e) => {
    if (!state.pdfDoc || !state.pageCanvases[pageNum] || pageNum !== state.currentPageNum) return; 
    const { overlayCanvas } = state.pageCanvases[pageNum];
    const pos = getCanvasMousePos(e, overlayCanvas);
    
    if (e.button === 1) { // Prevent scrollbar from moving on middle-click
        e.preventDefault();
    }
    
    const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;

    if (state.currentTool === 'selection' && !state.isSpacebarDown) {
        e.preventDefault();

        // If there's an active selection, check if we're interacting with it
        if (state.currentSelection) {
            const handles = sm.getHandlesForSelection(state.currentSelection);
            
            // Check for handle click (resize)
            for (const handleName in handles) {
                const handle = handles[handleName];
                if (pos.x >= handle.x && pos.x <= handle.x + handle.width &&
                    pos.y >= handle.y && pos.y <= handle.y + handle.height) {
                    state.activeHandle = handleName;
                    showMagnifier();
                    return; // Start resizing
                }
            }
            
            // Check for body click (move)
            const body = state.currentSelection;
            if (pos.x >= body.x && pos.x <= body.x + body.width &&
                pos.y >= body.y && pos.y <= body.y + body.height) {
                state.isMovingSelection = true;
                state.panStartMouse = pos;
                showMagnifier();
                return; // Start moving
            }
        }
        
        // If we clicked outside or there was no selection, clear the old one and start a new one.
        await sm.clearCurrentSelectionState();
        
        state.isDrawingSelection = true;
        state.selectionStartCanvasPoint = pos;
        state.selectionEndCanvasPoint = pos;
        showMagnifier();
        
        state.currentSelection = { 
            x: pos.x, y: pos.y, 
            width: 0, height: 0, page: pageNum 
        };
        sm.updateLiveSelectionInfoBox(state.currentSelection, e.clientX, e.clientY);

    } else if (state.currentTool === 'pan' || state.isSpacebarDown || e.button === 1) {
        e.preventDefault();
        state.isPanning = true;
        state.panStartMouse = { x: e.clientX, y: e.clientY };
        state.panInitialScroll = { x: panContainer.scrollLeft, y: panContainer.scrollTop };
        panContainer.style.cursor = 'grabbing';
        overlayCanvas.style.cursor = 'grabbing';
        dom.liveSelectionInfoBox.classList.add('hidden');
    }
};

const getCursorForHandle = (handleName) => {
    switch (handleName) {
        case 'topLeft': case 'bottomRight': return 'nwse-resize';
        case 'topRight': case 'bottomLeft': return 'nesw-resize';
        case 'top': case 'bottom': return 'ns-resize';
        case 'left': case 'right': return 'ew-resize';
        default: return 'move';
    }
};

export const createMouseMoveHandler = (pageNum) => async (e) => {
    if (!state.pageCanvases[pageNum] || pageNum !== state.currentPageNum) return;
    
    const { overlayCanvas } = state.pageCanvases[pageNum];
    let pos = getCanvasMousePos(e, overlayCanvas);

    // Selection Adjustment Logic
    if (state.currentTool === 'selection' && !state.isSpacebarDown) {
        
        // If we are actively drawing, moving, or resizing a selection
        if (state.activeHandle || state.isMovingSelection || state.isDrawingSelection) {
            
            if (!state.currentSelection) {
                // This case can happen in a race condition, e.g., if a mouseleave finalized a selection
                // but a mousemove event was already queued. Safely ignore it.
                return;
            }

            updateMagnifier(e, pageNum);

            // --- AUTO SCROLL LOGIC for smooth scrolling ---
            const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
            const containerRect = panContainer.getBoundingClientRect();
            const scrollThreshold = 50; // Distance from edge to start scrolling
            const maxScrollSpeed = 20; // Maximum pixels to scroll per mouse move event

            let scrollX = 0;
            let scrollY = 0;

            const leftDist = e.clientX - containerRect.left;
            const rightDist = containerRect.right - e.clientX;
            const topDist = e.clientY - containerRect.top;
            const bottomDist = containerRect.bottom - e.clientY;

            if (leftDist < scrollThreshold) {
                const speedFactor = 1 - (leftDist / scrollThreshold);
                scrollX = -maxScrollSpeed * speedFactor * speedFactor;
            } else if (rightDist < scrollThreshold) {
                const speedFactor = 1 - (rightDist / scrollThreshold);
                scrollX = maxScrollSpeed * speedFactor * speedFactor;
            }

            if (topDist < scrollThreshold) {
                const speedFactor = 1 - (topDist / scrollThreshold);
                scrollY = -maxScrollSpeed * speedFactor * speedFactor;
            } else if (bottomDist < scrollThreshold) {
                const speedFactor = 1 - (bottomDist / scrollThreshold);
                scrollY = maxScrollSpeed * speedFactor * speedFactor;
            }
            
            if (scrollX !== 0 || scrollY !== 0) {
                panContainer.scrollLeft += scrollX;
                panContainer.scrollTop += scrollY;
                pos = getCanvasMousePos(e, overlayCanvas);
            }
            // --- END AUTO SCROLL ---

            if (state.activeHandle) { // Resizing
                const { x, y, width, height } = state.currentSelection;
                const startX = x;
                const startY = y;
                const endX = x + width;
                const endY = y + height;
                
                switch (state.activeHandle) {
                    case 'topLeft':     state.currentSelection.x = pos.x; state.currentSelection.y = pos.y; state.currentSelection.width = endX - pos.x; state.currentSelection.height = endY - pos.y; break;
                    case 'topRight':    state.currentSelection.y = pos.y; state.currentSelection.width = pos.x - startX; state.currentSelection.height = endY - pos.y; break;
                    case 'bottomLeft':  state.currentSelection.x = pos.x; state.currentSelection.width = endX - pos.x; state.currentSelection.height = pos.y - startY; break;
                    case 'bottomRight': state.currentSelection.width = pos.x - startX; state.currentSelection.height = pos.y - startY; break;
                    case 'top':         state.currentSelection.y = pos.y; state.currentSelection.height = endY - pos.y; break;
                    case 'bottom':      state.currentSelection.height = pos.y - startY; break;
                    case 'left':        state.currentSelection.x = pos.x; state.currentSelection.width = endX - pos.x; break;
                    case 'right':       state.currentSelection.width = pos.x - startX; break;
                }
                 // Normalize selection (ensure width/height are positive)
                if (state.currentSelection.width < 0) {
                    state.currentSelection.x += state.currentSelection.width;
                    state.currentSelection.width *= -1;
                }
                if (state.currentSelection.height < 0) {
                    state.currentSelection.y += state.currentSelection.height;
                    state.currentSelection.height *= -1;
                }
    
            } else if (state.isMovingSelection) { // Moving
                const dx = pos.x - state.panStartMouse.x;
                const dy = pos.y - state.panStartMouse.y;
                
                state.currentSelection.x += dx;
                state.currentSelection.y += dy;

                state.panStartMouse = pos;
            } else if (state.isDrawingSelection) { // Drawing new selection
                state.selectionEndCanvasPoint = pos;
                const x = Math.min(state.selectionStartCanvasPoint.x, state.selectionEndCanvasPoint.x);
                const y = Math.min(state.selectionStartCanvasPoint.y, state.selectionEndCanvasPoint.y);
                const width = Math.abs(state.selectionEndCanvasPoint.x - state.selectionStartCanvasPoint.x);
                const height = Math.abs(state.selectionEndCanvasPoint.y - state.selectionStartCanvasPoint.y);
                
                state.currentSelection.x = x;
                state.currentSelection.y = y;
                state.currentSelection.width = width;
                state.currentSelection.height = height;
            }

            // After any selection change, redraw and update info
            if (state.currentSelection) {
                await redrawCurrentPageOverlay();
                sm.updateSelectionInfoUI(state.currentSelection.width, state.currentSelection.height);
                sm.updateLiveSelectionInfoBox(state.currentSelection, e.clientX, e.clientY);
            }

        }
        
        // Update cursor based on position relative to the active selection
        let cursor = 'crosshair';
        if (state.currentSelection && !state.isDrawingSelection) {
            const handles = sm.getHandlesForSelection(state.currentSelection);
            let onHandle = false;
            for (const handleName in handles) {
                const handle = handles[handleName];
                if (pos.x >= handle.x && pos.x <= handle.x + handle.width &&
                    pos.y >= handle.y && pos.y <= handle.y + handle.height) {
                    cursor = getCursorForHandle(handleName);
                    onHandle = true;
                    break;
                }
            }
            if (!onHandle) {
                const body = state.currentSelection;
                if (pos.x >= body.x && pos.x <= body.x + body.width &&
                    pos.y >= body.y && pos.y <= body.y + body.height) {
                    cursor = 'move';
                }
            }
        }
        overlayCanvas.style.cursor = cursor;

    } else if ((state.currentTool === 'pan' || state.isSpacebarDown || e.buttons === 4) && state.isPanning) {
        e.preventDefault();
        const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
        const dx = e.clientX - state.panStartMouse.x;
        const dy = e.clientY - state.panStartMouse.y;
        panContainer.scrollLeft = state.panInitialScroll.x - dx;
        panContainer.scrollTop = state.panInitialScroll.y - dy;
    }
};

const finalizeCurrentSelection = async () => {
    if (state.currentSelection && (state.currentSelection.width > 5 || state.currentSelection.height > 5)) {
        await sm.saveSelectionAsMeasurement();
        await sm.extractTextFromSelection(state.currentSelection);
    } else {
        await sm.clearCurrentSelectionState();
    }
    await redrawCurrentPageOverlay();
};

export const createMouseUpHandler = (pageNum) => async (e) => {
    if (!state.pageCanvases[pageNum] || pageNum !== state.currentPageNum) return;
    
    // Panning logic (handle first)
    if (state.isPanning) {
        state.isPanning = false;
        const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
        const overlay = state.pageCanvases[state.currentPageNum]?.overlayCanvas;
        
        const newCursor = (state.isSpacebarDown || state.currentTool === 'pan') ? 'grab' : (state.currentTool === 'selection' ? 'crosshair' : 'text');
        if (panContainer) panContainer.style.cursor = newCursor;
        if (overlay) overlay.style.cursor = newCursor;
    }

    // Selection logic
    if ((state.isDrawingSelection || state.activeHandle || state.isMovingSelection) && state.currentTool === 'selection') {
        state.isDrawingSelection = false;
        state.activeHandle = null;
        state.isMovingSelection = false;
        dom.liveSelectionInfoBox.classList.add('hidden');
        hideMagnifier();
        await finalizeCurrentSelection();
    }
};

export const createMouseLeaveHandler = (pageNum) => async (e) => {
    if (pageNum !== state.currentPageNum || !state.pageCanvases[pageNum]) return; 
    
    // If leaving the canvas while drawing/adjusting, finalize the action
    if (state.isDrawingSelection || state.activeHandle || state.isMovingSelection) {
        state.isDrawingSelection = false;
        state.activeHandle = null;
        state.isMovingSelection = false;
        dom.liveSelectionInfoBox.classList.add('hidden');
        hideMagnifier();
        await finalizeCurrentSelection();
    }
};

const wheelHandler = async (event) => {
    if (!state.pdfDoc) return;
    const container = event.currentTarget;

    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const newZoomLevel = event.deltaY < 0 ? state.zoomLevel + 0.1 : state.zoomLevel - 0.1;
        await handleZoomChange(newZoomLevel);
        return;
    }
    
    if (event.shiftKey) {
        event.preventDefault();
        container.scrollLeft += event.deltaY;
        return;
    }
    
    const now = Date.now();
    if (now - state.lastPageScrollTime < PAGE_SCROLL_DEBOUNCE_MS) {
        event.preventDefault(); // Stop native scroll during debounce period to prevent jumpy behavior
        return;
    }

    const isVerticallyScrollable = container.scrollHeight > container.clientHeight;
    
    // Scrolling down
    if (event.deltaY > 0) {
        const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
        if (!isVerticallyScrollable || isAtBottom) {
            if (dom.nextPageBtn && !dom.nextPageBtn.disabled) {
                event.preventDefault();
                state.lastPageScrollTime = now;
                dom.nextPageBtn.click();
            }
        }
    } 
    // Scrolling up
    else if (event.deltaY < 0) {
        const isAtTop = container.scrollTop <= 1;
        if (!isVerticallyScrollable || isAtTop) {
            if (dom.prevPageBtn && !dom.prevPageBtn.disabled) {
                event.preventDefault();
                state.lastPageScrollTime = now;
                dom.prevPageBtn.click();
            }
        }
    }
};

export async function handleFontInspectorClick(event) {
    if (state.currentTool !== 'font-inspector' || !state.pdfDoc || !state.pageCanvases[state.currentPageNum]) return;

    resetFontInspectorProperties();

    const { overlayCanvas } = state.pageCanvases[state.currentPageNum];
    const clickPos = getCanvasMousePos(event, overlayCanvas);

    const page = await state.pdfDoc.getPage(state.currentPageNum);
    const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });
    const textContent = await page.getTextContent();

    let clickedItem = null;

    for (const item of textContent.items) {
        const tx = item.transform;
        const itemWidthPdf = item.width;
        const itemPdfHeight = Math.abs(item.height || tx[3] || 10);
        const pdfItemX = tx[4];
        const pdfItemY = tx[5];

        const descender = itemPdfHeight * 0.25;
        const ascender = itemPdfHeight * 0.75;
        
        const itemRectPdf = [
            pdfItemX, 
            pdfItemY - descender,
            pdfItemX + itemWidthPdf, 
            pdfItemY + ascender
        ];

        const p1Canvas = viewport.convertToViewportPoint(itemRectPdf[0], itemRectPdf[1]);
        const p2Canvas = viewport.convertToViewportPoint(itemRectPdf[2], itemRectPdf[3]);
        
        const itemBbox = {
            x: Math.min(p1Canvas[0], p2Canvas[0]),
            y: Math.min(p1Canvas[1], p2Canvas[1]),
            width: Math.abs(p2Canvas[0] - p1Canvas[0]),
            height: Math.abs(p2Canvas[1] - p1Canvas[1]),
        };

        if (clickPos.x >= itemBbox.x && clickPos.x <= itemBbox.x + itemBbox.width &&
            clickPos.y >= itemBbox.y && clickPos.y <= itemBbox.y + itemBbox.height) {
            clickedItem = item;
            state.fontInspector.highlightedTextBbox = itemBbox;
            break;
        }
    }

    if (clickedItem) {
        const fontId = clickedItem.fontName;
        const foundFont = state.allDocumentFonts.find(f => f.id === fontId);

        if (foundFont) {
            const fontDetails = parseFontNameDetails(foundFont.name);
            const fontSize = Math.abs(clickedItem.height || clickedItem.transform[3] || 1);
            const hScale = fontSize > 0 ? (clickedItem.transform[0] / fontSize) * 100 : 100;
            
            dom.propFontFamily.textContent = fontDetails.originalName;
            dom.propFontFamily.title = fontDetails.originalName;
            dom.propFontSize.textContent = `${fontSize.toFixed(2)}pt`;
            dom.propHorizScale.textContent = `${hScale.toFixed(1)}%`;

            const listItemToHighlight = dom.fontInspectorListContainer.querySelector(`li[data-font-id="${foundFont.id}"]`);
            if (listItemToHighlight) {
                listItemToHighlight.classList.add('highlighted');
                listItemToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            const fontSize = Math.abs(clickedItem.height || clickedItem.transform[3] || 1);
            const hScale = fontSize > 0 ? (clickedItem.transform[0] / fontSize) * 100 : 100;
            
            dom.propFontFamily.textContent = fontId;
            dom.propFontFamily.title = `Internal Font ID: ${fontId}`;
            dom.propFontSize.textContent = `${fontSize.toFixed(2)}pt`;
            dom.propHorizScale.textContent = `${hScale.toFixed(1)}%`;
        }
    }
    
    await redrawCurrentPageOverlay();
}