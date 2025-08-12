
// @ts-nocheck
import * as dom from './dom.js';
import { state } from './state.js';
import { parseFontNameDetails } from './utils.js';
import { extractAllFontsFromDoc } from './FontUtils.js';

export function resetFontInspectorProperties() {
    dom.propFontFamily.textContent = '--';
    dom.propFontFamily.title = '';
    dom.propFontSize.textContent = '--';
    dom.propHorizScale.textContent = '--';
    state.fontInspector.highlightedTextBbox = null;
}

export const initializeFontInspectorView = async () => {
    if (!state.pdfDoc) return;
    
    resetFontInspectorProperties();
    
    if (state.allDocumentFonts.length === 0) {
        await extractAllFontsFromDoc();
    }

    if (dom.fontInspectorSummary) {
        dom.fontInspectorSummary.textContent = `Found ${state.allDocumentFonts.length} fonts in ${state.pdfFilename}`;
    }

    dom.fontInspectorListContainer.innerHTML = '';
    const listEl = document.createElement('ul');
    listEl.id = 'font-inspector-font-list';
    listEl.className = 'text-sm text-gray-800';

    if (state.allDocumentFonts.length === 0) {
        listEl.innerHTML = `<li class="p-4 text-gray-500 italic">No text-based fonts found.</li>`;
    } else {
        state.allDocumentFonts.forEach(font => {
            const details = parseFontNameDetails(font.name);
            const listItem = document.createElement('li');
            listItem.dataset.fontId = font.id;
            listItem.dataset.fontName = font.name;
            listItem.title = `Original: ${details.originalName}\nID: ${font.id}`;
            
            let displayText = `<span class="font-semibold">${details.family}</span>, ${details.style}`;
            if (details.isSubset) {
                displayText += ` <span class="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">Subset</span>`;
            }
            listItem.innerHTML = displayText;
            listEl.appendChild(listItem);
        });
    }
    dom.fontInspectorListContainer.appendChild(listEl);
};
