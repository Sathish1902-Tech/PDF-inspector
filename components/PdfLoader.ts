
// @ts-nocheck
import * as dom from './dom.js';
import { state } from './state.js';
import { showModal, showStatusUpdate, clearColumnAnalysisState } from './utils.js';
import { setActiveTool } from './tools.js';
import { updateMeasurementsList } from './Sidebar.js';
import { clearCurrentSelectionState } from './SelectionManager.js';

declare const pdfjsLib: any;

export async function onFileUpload(event) {
    if (state.activePdfRenderTask) {
        state.activePdfRenderTask.cancel();
        state.activePdfRenderTask = null;
    }
    dom.liveSelectionInfoBox.classList.add('hidden');

    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
        await showModal('Error', 'Please select a valid PDF file.');
        return;
    }
    
    // Reset application state for the new file
    resetForNewFile(file.name);

    const fileReader = new FileReader();
    fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        try {
            state.pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
            if (!state.pdfDoc || !state.pdfDoc.numPages || state.pdfDoc.numPages === 0) {
                throw new Error("PDF document loaded but has no pages or is invalid.");
            }
            state.totalPages = state.pdfDoc.numPages;
            showStatusUpdate(`Loading PDF with ${state.totalPages} pages...`);
            
            await setActiveTool('selection', false); // Default to selection view, don't re-render here
            
            // Show all relevant UI controls
            state.allControlElements.forEach(el => {
                if (!el) return;
                
                if (el === dom.clearMeasurementsBtn) {
                    if (state.measurements.length > 0) el.classList.remove('hidden');
                    else el.classList.add('hidden');
                } else if (el === dom.pageDimensionsSection) {
                     if (state.pdfDoc && state.totalPages > 0) el.classList.remove('hidden');
                     else el.classList.add('hidden');
                }
                else {
                    el.classList.remove('hidden');
                }

                if (el === dom.pageNavigationControls || el === dom.zoomControls || el === dom.mainToolbar) {
                    el.classList.add('flex');
                }
            });
            
            // Dispatch the render request
            document.dispatchEvent(new CustomEvent('app:render_request'));
            dom.zoomLevelSpan.textContent = `${Math.round(state.zoomLevel * 100)}%`;
            
        } catch (error) {
            console.error("Error loading PDF:", error);
            await showModal("Error", `Could not load or parse the PDF. <br>Details: ${error.message || 'Unknown error'}`);
            state.allControlElements.forEach(el => el?.classList.add('hidden')); 
            state.totalPages = 0; 
            state.pdfDoc = null; 
            // updatePageNavigationUI(); 
        } finally {
            dom.pdfLoadingIndicator.classList.add('hidden');
        }
    };
    fileReader.readAsArrayBuffer(file);
}

function resetForNewFile(filename) {
    dom.pdfPagesContainer.innerHTML = ''; 
    dom.fontInspectorPdfContainer.innerHTML = '';
    dom.fontInspectorListContainer.innerHTML = '';
    
    state.pdfFilename = filename;
    state.pageCanvases = {}; 
    state.measurements = []; 
    state.isPanning = false; 
    state.currentPageNum = 1;
    state.totalPages = 0;
    state.pdfDoc = null; 
    state.currentRotation = 0; 
    state.allDocumentFonts = [];
    state.zoomLevel = 1.0;
    state.fontInspector.highlightedTextBbox = null;

    clearCurrentSelectionState(); 
    clearColumnAnalysisState();
    updateMeasurementsList(); 

    if (dom.pageAnalysisResults) dom.pageAnalysisResults.classList.add('hidden');
    if (dom.linesCount) dom.linesCount.textContent = '--';
    if (dom.wordsCount) dom.wordsCount.textContent = '--';
    if (dom.pageDimensionsSection) dom.pageDimensionsSection.classList.add('hidden');
    if (dom.autoSpecsResults) dom.autoSpecsResults.classList.add('hidden');

    state.allControlElements.forEach(el => el?.classList.add('hidden'));
    dom.pdfLoadingIndicator.classList.remove('hidden');
}
