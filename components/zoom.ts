
// @ts-nocheck
import { state } from './state.js';
import * as dom from './dom.js';
import { ZOOM_STEP } from './types.js';

export async function handleZoomChange(newZoomLevel) {
    if (!state.pdfDoc || newZoomLevel <= 0.1) return;
    state.zoomLevel = Math.max(ZOOM_STEP / 2, newZoomLevel);
    
    dom.zoomLevelSpan.textContent = `${Math.round(state.zoomLevel * 100)}%`;
    document.dispatchEvent(new CustomEvent('app:render_request'));
}

export async function handleFitInWindow() {
    const container = (state.currentTool === 'font-inspector') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
    if (!state.pdfDoc || !container) return;
    const page = await state.pdfDoc.getPage(state.currentPageNum);
    const viewport = page.getViewport({ scale: 1.0, rotation: state.currentRotation });
    
    const containerWidth = container.clientWidth - 30; // some padding
    const containerHeight = container.clientHeight - 30;
    
    const scaleX = containerWidth / viewport.width;
    const scaleY = containerHeight / viewport.height;
    
    await handleZoomChange(Math.min(scaleX, scaleY));
}

export async function handleFitWidth() {
    const container = (state.currentTool === 'font-inspector') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
    if (!state.pdfDoc || !container) return;
    const page = await state.pdfDoc.getPage(state.currentPageNum);
    const viewport = page.getViewport({ scale: 1.0, rotation: state.currentRotation });
    
    const containerWidth = container.clientWidth - 30; // some padding
    await handleZoomChange(containerWidth / viewport.width);
}
