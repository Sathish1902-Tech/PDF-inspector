
// @ts-nocheck
import { state } from './state.js';
import * as dom from './dom.js';
import * as types from './types.js';
import { showStatusUpdate, clearColumnAnalysisState } from './utils.js';
import { clearCurrentSelectionState, activateMeasurement, drawCurrentSelection, redrawPersistentMeasurementsForPage } from './SelectionManager.js';
import { updateToolStateUI } from './tools.js';
import { updatePageNavigationUI } from './navigation.js';
import { updatePageDimensionsUI } from './Sidebar.js';
import * as Interaction from './Interaction.js';

declare const pdfjsLib: any;

export const renderCurrentPageAsync = async () => {
    if (state.activePdfRenderTask) {
        state.activePdfRenderTask.cancel();
        state.activePdfRenderTask = null;
    }
    dom.liveSelectionInfoBox.classList.add('hidden');
    clearColumnAnalysisState();

    if (!state.pdfDoc || state.currentPageNum < 1 || state.currentPageNum > state.totalPages) {
        dom.pdfPagesContainer.innerHTML = '<p class="text-red-500">Could not load page.</p>';
        dom.pageDimensionsSection.classList.add('hidden');
        return;
    }
    
    // Preserve the active selection index across re-renders (e.g., zoom, rotate)
    const activeMeasurementIndexToPreserve = state.activeMeasurementIndex;

    const targetContainer = (state.currentTool === 'font-inspector') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
    if (state.currentTool === 'font-inspector') {
        targetContainer.style.cursor = 'text';
    }

    dom.pdfLoadingIndicator.classList.remove('hidden');
    targetContainer.innerHTML = ''; 
    state.pageCanvases = {}; 
    await clearCurrentSelectionState(); // Clears state.currentSelection and selection UI

    if (dom.pageAnalysisResults) dom.pageAnalysisResults.classList.add('hidden');
    if (dom.linesCount) dom.linesCount.textContent = '--';
    if (dom.wordsCount) dom.wordsCount.textContent = '--';
    
    try {
        const page = await state.pdfDoc.getPage(state.currentPageNum);
        updatePageDimensionsUI(page); 
       
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'page-wrapper';
        pageWrapper.id = `page-wrapper-${state.currentPageNum}`;
        pageWrapper.dataset.pageNumber = String(state.currentPageNum);

        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.className = 'pdf-page-canvas';
        pdfCanvas.id = `pdf-canvas-${state.currentPageNum}`;

        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.className = 'overlay-page-canvas';
        overlayCanvas.id = `overlay-canvas-${state.currentPageNum}`;

        targetContainer.appendChild(pageWrapper); 
        
        const ctxPdf = pdfCanvas.getContext('2d');
        const ctxOverlay = overlayCanvas.getContext('2d');

        if (!ctxPdf || !ctxOverlay) {
            throw new Error(`Failed to get 2D context for page ${state.currentPageNum}`);
        }

        // imageSmoothingEnabled settings are now set in renderPdfPageToCanvas *after* resizing,
        // as resizing the canvas resets its context state, which was causing the blurriness.

        state.pageCanvases[state.currentPageNum] = {
            pdfCanvas, overlayCanvas, ctxPdf, ctxOverlay, pageWrapper
        };
        
        overlayCanvas.addEventListener('mousedown', (e) => Interaction.createMouseDownHandler(state.currentPageNum)(e));
        overlayCanvas.addEventListener('mousemove', (e) => Interaction.createMouseMoveHandler(state.currentPageNum)(e));
        overlayCanvas.addEventListener('mouseup', (e) => Interaction.createMouseUpHandler(state.currentPageNum)(e));
        overlayCanvas.addEventListener('mouseleave', (e) => Interaction.createMouseLeaveHandler(state.currentPageNum)(e));
        overlayCanvas.addEventListener('click', (e) => Interaction.handleFontInspectorClick(e));

        await renderPdfPageToCanvas(page, state.currentPageNum);
        updatePageNavigationUI();
        
        // After rendering, check if we need to restore the active selection
        if (activeMeasurementIndexToPreserve !== null) {
            await activateMeasurement(activeMeasurementIndexToPreserve);
        } 
        // Or if we need to activate a new measurement (e.g., from a page change)
        else if (state.pendingMeasurementActivation !== null) {
            const indexToActivate = state.pendingMeasurementActivation;
            state.pendingMeasurementActivation = null;
            await activateMeasurement(indexToActivate);
        }

    } catch (error) { 
        console.error(`Error getting or rendering page ${state.currentPageNum}:`, error);
        targetContainer.innerHTML = `<p class="text-red-500">Error loading page ${state.currentPageNum}: ${error.message || error}</p>`;
        showStatusUpdate(`Failed to load page ${state.currentPageNum}.`);
        dom.pageDimensionsSection.classList.add('hidden');
    } finally {
        dom.pdfLoadingIndicator.classList.add('hidden');
    }
};

const renderPdfPageToCanvas = async (page, pageNumToRender) => {
    if (!state.pageCanvases[pageNumToRender]) {
        console.warn(`Canvas for page ${pageNumToRender} not found. Skipping render.`);
        return;
    }
    const { pdfCanvas, overlayCanvas, ctxPdf, ctxOverlay, pageWrapper } = state.pageCanvases[pageNumToRender];
    const dpr = window.devicePixelRatio || 1;
    
    const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });

    if (viewport.width <= 0 || viewport.height <= 0) {
        throw new Error(`Page ${pageNumToRender} has invalid viewport dimensions.`);
    }
    
    pageWrapper.style.border = ''; 
    let currentChildren = Array.from(pageWrapper.childNodes);
    currentChildren.forEach(child => {
        if (child !== pdfCanvas && child !== overlayCanvas && !(child instanceof HTMLLabelElement || (child instanceof HTMLDivElement && child.classList.contains('measurement-label')))) {
            pageWrapper.removeChild(child);
        }
    });
    if (!pageWrapper.contains(pdfCanvas)) pageWrapper.appendChild(pdfCanvas);
    if (!pageWrapper.contains(overlayCanvas)) pageWrapper.appendChild(overlayCanvas);
    
    // Correctly size canvas for HiDPI displays to ensure sharpness.
    const logicalWidth = viewport.width;
    const logicalHeight = viewport.height;

    pdfCanvas.width = Math.round(logicalWidth * dpr);
    pdfCanvas.height = Math.round(logicalHeight * dpr);
    pdfCanvas.style.width = `${logicalWidth}px`;
    pdfCanvas.style.height = `${logicalHeight}px`;
    
    overlayCanvas.width = pdfCanvas.width;
    overlayCanvas.height = pdfCanvas.height;
    overlayCanvas.style.width = pdfCanvas.style.width;
    overlayCanvas.style.height = pdfCanvas.style.height;

    pageWrapper.style.width = pdfCanvas.style.width;
    pageWrapper.style.height = pdfCanvas.style.height;

    // Set properties *after* resizing, as resizing resets context. This is crucial for sharpness.
    ctxPdf.imageSmoothingEnabled = false;
    ctxOverlay.imageSmoothingEnabled = false;

    const renderContext = {
        canvasContext: ctxPdf,
        viewport: viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
        enableWebGL: true, // Use WebGL for potentially better rendering quality.
    };
    
    if (state.activePdfRenderTask) {
        state.activePdfRenderTask.cancel();
    }

    let renderTask;
    try {
        renderTask = page.render(renderContext);
        state.activePdfRenderTask = renderTask; 
        await renderTask.promise;
        await redrawCurrentPageOverlay(); 
        if (state.pageCanvases[pageNumToRender]?.overlayCanvas) {
             updateToolStateUI(state.currentTool);
        }
    } catch (error) {
        if (error.name === 'RenderingCancelledException' || (error.message && error.message.includes('Rendering cancelled'))) {
            console.log(`Render for page ${pageNumToRender} was cancelled.`);
        } else {
            console.error(`Error rendering PDF page ${pageNumToRender}:`, error);
            showStatusUpdate(`Error rendering page ${pageNumToRender}.`);
        }
    } finally {
        if (state.activePdfRenderTask === renderTask) {
            state.activePdfRenderTask = null;
        }
    }
};

const drawGrid = (ctx, viewport) => {
    if (!state.isGridVisible) return;
    const spacing = types.GRID_SPACING_POINTS * viewport.scale;
    ctx.strokeStyle = '#adadff';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = 0; x < viewport.width; x += spacing) {
        ctx.moveTo(Math.floor(x) + 0.5, 0);
        ctx.lineTo(Math.floor(x) + 0.5, viewport.height);
    }
    for (let y = 0; y < viewport.height; y += spacing) {
        ctx.moveTo(0, Math.floor(y) + 0.5);
        ctx.lineTo(viewport.width, Math.floor(y) + 0.5);
    }
    ctx.stroke();
};

export const redrawCurrentPageOverlay = async () => {
    if (!state.pdfDoc || !state.pageCanvases[state.currentPageNum]) return;
    
    try {
        const { ctxOverlay, overlayCanvas } = state.pageCanvases[state.currentPageNum];
        const page = await state.pdfDoc.getPage(state.currentPageNum);
        const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });
        const dpr = window.devicePixelRatio || 1;

        ctxOverlay.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); 
        
        ctxOverlay.save();
        ctxOverlay.scale(dpr, dpr);

        drawGrid(ctxOverlay, viewport);
        
        if (state.columnAnalysis.leftColumnBox && state.columnAnalysis.rightColumnBox && state.columnAnalysis.gutterBox) {
            const drawHighlightBox = (box, color) => {
                const [x1, y1] = viewport.convertToViewportPoint(box.x, box.y);
                const [x2, y2] = viewport.convertToViewportPoint(box.x + box.width, box.y + box.height);

                ctxOverlay.fillStyle = color;
                ctxOverlay.fillRect(
                    Math.min(x1, x2), 
                    Math.min(y1, y2), 
                    Math.abs(x2 - x1), 
                    Math.abs(y2 - y1)
                );
            };

            drawHighlightBox(state.columnAnalysis.leftColumnBox, 'rgba(0, 100, 255, 0.15)');
            drawHighlightBox(state.columnAnalysis.rightColumnBox, 'rgba(0, 100, 255, 0.15)');
            drawHighlightBox(state.columnAnalysis.gutterBox, 'rgba(255, 0, 0, 0.15)');
        }

        if (state.currentTool === 'font-inspector') {
            if (state.fontInspector.highlightedTextBbox) {
                ctxOverlay.fillStyle = 'rgba(168, 206, 255, 0.6)';
                const { x, y, width, height } = state.fontInspector.highlightedTextBbox;
                ctxOverlay.fillRect(x, y, width, height);
            }
        } else {
            await redrawPersistentMeasurementsForPage(state.currentPageNum);
        }
        
        drawCurrentSelection(ctxOverlay);
        
        ctxOverlay.restore();

    } catch (error) {
        console.error("Failed to redraw overlay:", error);
    }
};