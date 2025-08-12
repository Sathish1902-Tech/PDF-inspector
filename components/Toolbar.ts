// @ts-nocheck
import * as dom from './dom.js';
import { state } from './state.js';
import { setActiveTool, updateToolStateUI } from './tools.js';
import { handleZoomChange, handleFitInWindow, handleFitWidth } from './zoom.js';
import { redrawCurrentPageOverlay } from './PdfRenderer.js';

export function initToolbar() {
    dom.selectionToolBtn.addEventListener('click', () => setActiveTool('selection'));
    dom.panToolBtn.addEventListener('click', () => setActiveTool('pan'));
    dom.fontInspectorToolBtn.addEventListener('click', () => setActiveTool('font-inspector'));
    dom.fontFinderToolBtn.addEventListener('click', () => setActiveTool('font-finder'));
    dom.backToMeasurementViewBtn.addEventListener('click', () => setActiveTool('selection'));
}

export function initZoomButtons() {
    dom.zoomInBtn.addEventListener('click', () => handleZoomChange(state.zoomLevel + 0.1));
    dom.zoomOutBtn.addEventListener('click', () => handleZoomChange(state.zoomLevel - 0.1));
    dom.viewMenuZoomIn?.addEventListener('click', () => handleZoomChange(state.zoomLevel + 0.1));
    dom.viewMenuZoomOut?.addEventListener('click', () => handleZoomChange(state.zoomLevel - 0.1));
}

export function initViewMenu() {
    dom.viewMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.viewDropdownMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
        dom.viewDropdownMenu.classList.add('hidden');
    });

    dom.viewMenuFitWindow?.addEventListener('click', handleFitInWindow);
    dom.viewMenuActualSize?.addEventListener('click', () => handleZoomChange(1.0));
    dom.viewMenuFitWidth?.addEventListener('click', handleFitWidth);
    dom.viewMenuFitVisible?.addEventListener('click', handleFitInWindow);
    dom.viewMenuRotateCW?.addEventListener('click', () => handleRotate(90));
    dom.viewMenuRotateCCW?.addEventListener('click', () => handleRotate(-90));
    dom.viewMenuGrid?.addEventListener('click', toggleGrid);
}

export function initKeyboardShortcuts() {
    window.addEventListener('keydown', async (event) => {
        if (!state.pdfDoc) return;

        const target = event.target as HTMLElement;
        const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        // Spacebar pan activation
        if (event.key === ' ' && !isEditing) {
            event.preventDefault();
            if (!state.isSpacebarDown) { // Fire only once per press
                state.isSpacebarDown = true;
                if (!state.isPanning) {
                    const overlay = state.pageCanvases[state.currentPageNum]?.overlayCanvas;
                    const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
                    const grabCursor = 'grab';
                    if (overlay) overlay.style.cursor = grabCursor;
                    if (panContainer) panContainer.style.cursor = grabCursor;
                }
            }
            return; // Prevent other shortcuts while holding space
        }

        if (event.ctrlKey || event.metaKey) {
            let handled = true;
            switch (event.key.toLowerCase()) {
                case '+': case '=': await handleZoomChange(state.zoomLevel + 0.1); break;
                case '-': await handleZoomChange(state.zoomLevel - 0.1); break;
                case '0': await handleFitInWindow(); break;
                case '1': await handleZoomChange(1.0); break;
                case '2': await handleFitWidth(); break;
                case 'u': if (!isEditing) await toggleGrid(); else handled = false; break;
                case 'end': 
                    if (state.currentPageNum !== state.totalPages) { 
                        state.currentPageNum = state.totalPages;
                        document.dispatchEvent(new CustomEvent('app:render_request'));
                    } 
                    break;
                case 'home': 
                    if (state.currentPageNum !== 1) { 
                        state.currentPageNum = 1; 
                        document.dispatchEvent(new CustomEvent('app:render_request'));
                    } 
                    break;
                default: handled = false;
            }
             if (event.shiftKey && !handled) {
                handled = true;
                switch (event.key.toLowerCase()) {
                    case '+': await handleRotate(90); break;
                    case '_': await handleRotate(-90); break;
                    default: handled = false;
                }
            }
            if(handled) event.preventDefault();
        }
        else if (!isEditing) {
            let handled = true;
            const panContainer = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
            const scrollAmount = 40; // Pixels to scroll on arrow key press
            const isHorizontallyScrollable = panContainer ? panContainer.scrollWidth > panContainer.clientWidth : false;

            switch (event.key) {
                case 'PageUp': if (dom.prevPageBtn && !dom.prevPageBtn.disabled) { dom.prevPageBtn.click(); } break;
                case 'PageDown': if (dom.nextPageBtn && !dom.nextPageBtn.disabled) { dom.nextPageBtn.click(); } break;
                case 'ArrowUp': if (panContainer) panContainer.scrollTop -= scrollAmount; break;
                case 'ArrowDown': if (panContainer) panContainer.scrollTop += scrollAmount; break;
                case 'ArrowLeft': 
                    if (isHorizontallyScrollable && panContainer) {
                         panContainer.scrollLeft -= scrollAmount;
                    } else {
                        if (dom.prevPageBtn && !dom.prevPageBtn.disabled) { dom.prevPageBtn.click(); }
                    }
                    break;
                case 'ArrowRight': 
                     if (isHorizontallyScrollable && panContainer) {
                        panContainer.scrollLeft += scrollAmount;
                    } else {
                        if (dom.nextPageBtn && !dom.nextPageBtn.disabled) { dom.nextPageBtn.click(); }
                    }
                    break;
                default: handled = false;
            }
            if (handled) event.preventDefault();
        }
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === ' ') {
            const target = event.target as HTMLElement;
            const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            if (!isEditing) {
                event.preventDefault();
                state.isSpacebarDown = false;
                state.isPanning = false; // Force stop panning
                // Revert cursor to match the current tool
                updateToolStateUI(state.currentTool);
            }
        }
    });
}

async function handleRotate(degrees) {
    if (!state.pdfDoc) return;
    state.currentRotation = (state.currentRotation + degrees + 360) % 360;
    document.dispatchEvent(new CustomEvent('app:render_request'));
}

function updateViewMenuUI() {
    dom.viewMenuGridCheck.textContent = state.isGridVisible ? '✓' : '';
}

async function toggleGrid() {
    state.isGridVisible = !state.isGridVisible;
    updateViewMenuUI();
    await redrawCurrentPageOverlay();
}