// @ts-nocheck
import * as dom from './components/dom.js';
import { state } from './components/state.js';
import { onFileUpload } from './components/PdfLoader.js';
import { renderCurrentPageAsync } from './components/PdfRenderer.js';
import { initToolbar, initViewMenu, initZoomButtons, initKeyboardShortcuts } from './components/Toolbar.js';
import { initInteractions } from './components/Interaction.js';
import { initSidebar } from './components/Sidebar.js';
import { setActiveTool } from './components/tools.js';
import { updatePageNavigationUI } from './components/navigation.js';
import { initFontFinder } from './components/FontFinder.js';

declare const pdfjsLib: any;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof pdfjsLib === 'undefined') {
        console.error("pdf.js library is not loaded. Ensure the script tag is present in HTML.");
        alert("Error: PDF library failed to load. Please refresh the page.");
        return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;

    // Initialize all application modules
    initToolbar();
    initViewMenu();
    initZoomButtons();
    initKeyboardShortcuts();
    initInteractions();
    initSidebar();
    initFontFinder();
    
    // Setup initial event listeners
    dom.fileUpload.addEventListener('change', (event) => onFileUpload(event));

    // Centralized render handler to break circular dependencies
    document.addEventListener('app:render_request', async () => {
        await renderCurrentPageAsync();
    });

    // Initial UI State
    setActiveTool('selection');
    updatePageNavigationUI();
    state.allControlElements.forEach(el => el?.classList.add('hidden')); 
    if(dom.fileUpload && dom.fileUpload.parentElement) dom.fileUpload.parentElement.classList.remove('hidden'); 
    dom.liveSelectionInfoBox.classList.add('hidden');
});