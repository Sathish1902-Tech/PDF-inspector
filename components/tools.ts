// @ts-nocheck
import * as dom from './dom.js';
import { state } from './state.js';
import { initializeFontInspectorView } from './FontInspector.js';
import { clearColumnAnalysisState } from './utils.js';

export const updateToolStateUI = (tool) => {
    dom.selectionToolBtn?.classList.remove('active');
    dom.panToolBtn?.classList.remove('active');
    dom.fontInspectorToolBtn?.classList.remove('active');
    dom.fontFinderToolBtn?.classList.remove('active');

    const selectionCursor = 'crosshair';
    const panCursor = 'grab';
    const fontInspectorCursor = 'text';
    const defaultCursor = 'default';
    let cursor = defaultCursor;

    if (tool === 'selection') {
        dom.selectionToolBtn?.classList.add('active');
        cursor = selectionCursor;
    } else if (tool === 'pan') {
        dom.panToolBtn?.classList.add('active');
        cursor = panCursor;
    } else if (tool === 'font-inspector') {
        dom.fontInspectorToolBtn?.classList.add('active');
        cursor = fontInspectorCursor;
    } else if (tool === 'font-finder') {
        dom.fontFinderToolBtn?.classList.add('active');
        cursor = 'default';
    }
    
    const overlay = state.pageCanvases[state.currentPageNum]?.overlayCanvas;
    const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
    
    if (overlay) {
        overlay.style.cursor = cursor;
    }
    if (panContainer) {
        panContainer.style.cursor = cursor;
    }
};

export const setActiveTool = async (tool, reRender = true) => {
    // Defensively restore scrollability in case a selection was interrupted by the tool change.
    const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
    if (panContainer) {
        panContainer.style.overflow = 'auto';
    }

    state.currentTool = tool;
    dom.liveSelectionInfoBox.classList.add('hidden');
    
    clearColumnAnalysisState();
    updateToolStateUI(tool);

    // Hide all main views and remove flex
    dom.measurementView.classList.add('hidden');
    dom.fontInspectorPage.classList.add('hidden');
    dom.fontFinderView.classList.add('hidden');
    dom.fontInspectorPage.classList.remove('flex');
    dom.fontFinderView.classList.remove('flex');


    if (tool === 'font-inspector') {
        dom.fontInspectorPage.classList.remove('hidden');
        dom.fontInspectorPage.classList.add('flex');
        if (reRender) {
             await initializeFontInspectorView();
             document.dispatchEvent(new CustomEvent('app:render_request'));
        }
    } else if (tool === 'font-finder') {
        dom.fontFinderView.classList.remove('hidden');
        dom.fontFinderView.classList.add('flex');
    } else { // selection or pan
        dom.measurementView.classList.remove('hidden');
        if (reRender) {
            document.dispatchEvent(new CustomEvent('app:render_request'));
        }
    }
    
    state.isDrawingSelection = false; 
    state.isPanning = false; 
};