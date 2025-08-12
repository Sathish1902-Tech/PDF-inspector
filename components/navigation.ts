
// @ts-nocheck
import * as dom from './dom.js';
import { state } from './state.js';
import { showModal } from './utils.js';

export const updatePageNavigationUI = () => {
    if (!state.pdfDoc || state.totalPages === 0) {
        dom.pageNavigationControls.classList.add('hidden');
        return;
    }
    dom.pageNavigationControls.classList.remove('hidden');
    dom.pageNavigationControls.classList.add('flex');

    dom.pageNumInput.value = String(state.currentPageNum);
    dom.currentPageInfoSpan.textContent = `of ${state.totalPages}`;
    dom.prevPageBtn.disabled = state.currentPageNum <= 1;
    dom.nextPageBtn.disabled = state.currentPageNum >= state.totalPages;
    dom.pageNumInput.max = String(state.totalPages);
    dom.pageNumInput.min = "1";
};

export const goToPage = () => {
    const targetPage = parseInt(dom.pageNumInput.value);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= state.totalPages) {
        state.currentPageNum = targetPage;
        document.dispatchEvent(new CustomEvent('app:render_request'));
    } else {
        showModal("Invalid Page", `Please enter a page number between 1 and ${state.totalPages}.`);
        dom.pageNumInput.value = String(state.currentPageNum); 
    }
};

export const setupPageNavigation = () => {
    dom.prevPageBtn.addEventListener('click', () => {
        if (state.currentPageNum > 1) {
            state.currentPageNum--;
            document.dispatchEvent(new CustomEvent('app:render_request'));
        }
    });

    dom.nextPageBtn.addEventListener('click', () => {
        if (state.currentPageNum < state.totalPages) {
            state.currentPageNum++;
            document.dispatchEvent(new CustomEvent('app:render_request'));
        }
    });

    dom.goToPageBtn.addEventListener('click', goToPage);
};
