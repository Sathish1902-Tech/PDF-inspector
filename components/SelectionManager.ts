
// @ts-nocheck
import { state } from './state.js';
import * as dom from './dom.js';
import * as types from './types.js';
import { clearColumnAnalysisState, parseFontNameDetails, drawRect, calculateAndFormatSelectionMeasurement } from './utils.js';
import { redrawCurrentPageOverlay } from './PdfRenderer.js';
import { extractAllFontsFromDoc } from './FontUtils.js';

const HANDLE_SIZE = 8;

export const clearCurrentSelectionState = async () => {
    state.currentSelection = null;
    state.isDrawingSelection = false;
    state.isMovingSelection = false;
    state.activeHandle = null;
    state.activeMeasurementIndex = null;
    
    resetSelectionDetailsUI();
    dom.liveSelectionInfoBox.classList.add('hidden');
    clearColumnAnalysisState();

    // Remove 'selected' class from all measurement list items
    dom.measurementsListElement.querySelectorAll('li.selected').forEach(li => {
        li.classList.remove('selected');
    });

    if (state.pdfDoc && state.pageCanvases[state.currentPageNum]) { 
        await redrawCurrentPageOverlay();
    }
};

export function resetSelectionDetailsUI() {
    dom.selectionW.textContent = '--';
    dom.selectionH.textContent = '--';
    dom.selectionTextW.textContent = '--';
    dom.selectionTextLeading.textContent = '--';
    dom.manualLeadingInput.value = '';
    dom.selectionTextHLeadingRatio.textContent = '--'; 
    dom.selectionFontFamily.textContent = '--';
    dom.selectionFontFamily.title = '';
    dom.selectionFontStyle.textContent = '--';
    dom.selectionFontStyle.title = '';
    dom.selectionFontSize.textContent = '--';

    state.currentSelectionTextBlockHeightPdfPoints = null;
    state.currentSelectionAutoLeadingPdfPoints = null;
    dom.liveSelectionInfoBox.classList.add('hidden');
};

export const getHandlesForSelection = (selectionRect) => {
    if (!selectionRect) return {};
    const { x, y, width, height } = selectionRect;
    const half = HANDLE_SIZE / 2;
    return {
        topLeft: { x: x - half, y: y - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
        topRight: { x: x + width - half, y: y - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
        bottomLeft: { x: x - half, y: y + height - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
        bottomRight: { x: x + width - half, y: y + height - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
        top: { x: x + width / 2 - half, y: y - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
        bottom: { x: x + width / 2 - half, y: y + height - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
        left: { x: x - half, y: y + height / 2 - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
        right: { x: x + width - half, y: y + height / 2 - half, width: HANDLE_SIZE, height: HANDLE_SIZE },
    };
};

export function drawCurrentSelection(ctxOverlay) {
    if (state.currentTool !== 'selection' || !state.currentSelection || state.currentSelection.page !== state.currentPageNum) {
        return;
    }
    
    const { x, y, width, height } = state.currentSelection;
    if (width > 0 || height > 0) {
        const selectionColor = state.isDrawingSelection ? '#22c55e' : '#f59e0b'; // Green while drawing, orange when active
        const markLength = 10;

        ctxOverlay.strokeStyle = selectionColor;
        ctxOverlay.lineWidth = 1; // "tin" line

        // Draw the main selection rectangle with a dotted line for accuracy
        ctxOverlay.setLineDash([2, 3]); // "dot dot line" - 2px on, 3px off
        ctxOverlay.beginPath();
        ctxOverlay.rect(x, y, width, height);
        ctxOverlay.stroke();
        ctxOverlay.setLineDash([]); // Reset to solid line for other elements

        // Draw crop marks and handles only for active, non-drawing selections
        if (!state.isDrawingSelection) {
            ctxOverlay.beginPath();
            // Top-left
            ctxOverlay.moveTo(x, y + markLength); ctxOverlay.lineTo(x, y); ctxOverlay.lineTo(x + markLength, y);
            // Top-right
            ctxOverlay.moveTo(x + width - markLength, y); ctxOverlay.lineTo(x + width, y); ctxOverlay.lineTo(x + width, y + markLength);
            // Bottom-left
            ctxOverlay.moveTo(x, y + height - markLength); ctxOverlay.lineTo(x, y + height); ctxOverlay.lineTo(x + markLength, y + height);
            // Bottom-right
            ctxOverlay.moveTo(x + width - markLength, y + height); ctxOverlay.lineTo(x + width, y + height); ctxOverlay.lineTo(x + width, y + height - markLength);
            ctxOverlay.stroke();
            
            // Draw resize handles
            const handles = getHandlesForSelection(state.currentSelection);
            ctxOverlay.fillStyle = selectionColor;
            ctxOverlay.strokeStyle = 'white';
            ctxOverlay.lineWidth = 1;
            for (const handleName in handles) {
                const handle = handles[handleName];
                ctxOverlay.fillRect(handle.x, handle.y, handle.width, handle.height);
                ctxOverlay.strokeRect(handle.x, handle.y, handle.width, handle.height);
            }
        }
    }
}

export function updateSelectionInfoUI(widthInCanvasPixels, heightInCanvasPixels) {
    if (state.currentSelection && state.currentSelection.page === state.currentPageNum) { 
        const displayUnit = dom.displayUnitSelector.value;
        const unitLabel = displayUnit === 'picas' ? 'pc' : displayUnit;
        const widthInPdfPoints = widthInCanvasPixels / state.zoomLevel; 
        const heightInPdfPoints = heightInCanvasPixels / state.zoomLevel;
        const conversionFactorToUnit = 1 / types.unitToPoints[displayUnit];
        dom.selectionW.textContent = `${(widthInPdfPoints * conversionFactorToUnit).toFixed(2)} ${unitLabel}`;
        dom.selectionH.textContent = `${(heightInPdfPoints * conversionFactorToUnit).toFixed(2)} ${unitLabel}`;
    } else {
        dom.selectionW.textContent = '--';
        dom.selectionH.textContent = '--';
    }
}

export async function saveSelectionAsMeasurement() {
    if (!state.pdfDoc || !state.currentSelection || state.currentSelection.page !== state.currentPageNum) return;
    const page = await state.pdfDoc.getPage(state.currentSelection.page);
    const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });

    const [pdfX1, pdfY1] = viewport.convertToPdfPoint(state.currentSelection.x, state.currentSelection.y);
    const [pdfX2, pdfY2] = viewport.convertToPdfPoint(state.currentSelection.x + state.currentSelection.width, state.currentSelection.y + state.currentSelection.height);

    const newMeasurement = {
        type: 'selection',
        page: state.currentSelection.page,
        startPDF: { x: Math.min(pdfX1, pdfX2), y: Math.min(pdfY1, pdfY2) },
        endPDF: { x: Math.max(pdfX1, pdfX2), y: Math.max(pdfY1, pdfY2) },
        color: '#22c55e'
    };

    // When a selection is finalized (new or modified), replace all existing measurements with this one.
    state.measurements = [newMeasurement];
    state.activeMeasurementIndex = 0; // The new one is the only one.

    document.dispatchEvent(new CustomEvent('app:measurement_updated'));
}

export async function activateMeasurement(index) {
    if (index < 0 || index >= state.measurements.length) {
        return;
    }

    const measurement = state.measurements[index];
    if (measurement.page !== state.currentPageNum) {
        state.pendingMeasurementActivation = index;
        state.currentPageNum = measurement.page;
        document.dispatchEvent(new CustomEvent('app:render_request'));
        return;
    }

    // Now on the correct page, proceed with activation
    state.activeMeasurementIndex = index;
    
    const page = await state.pdfDoc.getPage(measurement.page);
    const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });

    const [x1, y1] = viewport.convertToViewportPoint(measurement.startPDF.x, measurement.startPDF.y);
    const [x2, y2] = viewport.convertToViewportPoint(measurement.endPDF.x, measurement.endPDF.y);

    state.currentSelection = {
        page: measurement.page,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1)
    };

    await extractTextFromSelection(state.currentSelection);
    await redrawCurrentPageOverlay();

    // Scroll into view
    const container = dom.measurementView.classList.contains('hidden') ? dom.fontInspectorPdfContainer : dom.pdfPagesContainer;
    container.scrollTo({
        left: state.currentSelection.x + state.currentSelection.width / 2 - container.clientWidth / 2,
        top: state.currentSelection.y + state.currentSelection.height / 2 - container.clientHeight / 2,
        behavior: 'smooth'
    });

    // Update sidebar UI
    dom.measurementsListElement.querySelectorAll('li').forEach((li, i) => {
        li.classList.toggle('selected', i === index);
    });
}

export async function extractTextFromSelection(selectionRect) {
    if (!state.pdfDoc || !selectionRect || selectionRect.page !== state.currentPageNum || !state.pageCanvases[state.currentPageNum]) {
        resetSelectionDetailsUI();
        return;
    }

    if (state.allDocumentFonts.length === 0) {
        await extractAllFontsFromDoc();
    }
    
    try {
        const page = await state.pdfDoc.getPage(selectionRect.page);
        const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });
        const textContent = await page.getTextContent();
        
        const [selPdfX1, selPdfY1] = viewport.convertToPdfPoint(selectionRect.x, selectionRect.y);
        const [selPdfX2, selPdfY2] = viewport.convertToPdfPoint(selectionRect.x + selectionRect.width, selectionRect.y + selectionRect.height);
        const selectionBoxPdf = {
            x: Math.min(selPdfX1, selPdfX2),
            y: Math.min(selPdfY1, selPdfY2),
            width: Math.abs(selPdfX2 - selPdfX1),
            height: Math.abs(selPdfY2 - selPdfY1),
        };
        
        const intersectingTextItems = [];
        
        textContent.items.forEach((item) => {
            const tx = item.transform;
            const itemWidthPdf = item.width;
            const itemPdfHeight = Math.abs(item.height || tx[3] || 10);
            const pdfItemX = tx[4];
            const pdfItemY = tx[5];

            const descender = itemPdfHeight * 0.25;
            const itemBoxPdf = {
                x: pdfItemX,
                y: pdfItemY - descender,
                width: itemWidthPdf,
                height: itemPdfHeight,
            };

            if (selectionBoxPdf.x < itemBoxPdf.x + itemBoxPdf.width &&
                selectionBoxPdf.x + selectionBoxPdf.width > itemBoxPdf.x &&
                selectionBoxPdf.y < itemBoxPdf.y + itemBoxPdf.height &&
                selectionBoxPdf.y + selectionBoxPdf.height > itemBoxPdf.y) {
                intersectingTextItems.push(item);
            }
        });

        if (intersectingTextItems.length === 0) {
            resetSelectionDetailsUI();
            updateSelectionInfoUI(selectionRect.width, selectionRect.height); // Keep box dimensions
            return;
        }

        const getFullFontName = (fontId) => {
            const foundFont = state.allDocumentFonts.find(f => f.id === fontId);
            return foundFont ? foundFont.name : fontId;
        };
        
        const firstItem = intersectingTextItems[0];
        const firstIntersectingItemDetails = parseFontNameDetails(getFullFontName(firstItem.fontName));
        const firstIntersectingItemFontSize = parseFloat(Math.abs(firstItem.height || firstItem.transform[3] || 10).toFixed(2));

        const uniqueFontFamilies = new Set(intersectingTextItems.map(item => parseFontNameDetails(getFullFontName(item.fontName)).family));
        const uniqueFontStyles = new Set(intersectingTextItems.map(item => parseFontNameDetails(getFullFontName(item.fontName)).style));
        const uniqueOriginalFontNames = new Set(intersectingTextItems.map(item => getFullFontName(item.fontName)));
        const uniqueFontSizes = new Set(intersectingTextItems.map(item => parseFloat(Math.abs(item.height || item.transform[3] || 10).toFixed(2))));
        
        dom.selectionFontFamily.textContent = uniqueFontFamilies.size > 1 ? 'Mixed' : firstIntersectingItemDetails.family;
        dom.selectionFontFamily.title = Array.from(uniqueOriginalFontNames).join('; ');
        
        dom.selectionFontStyle.textContent = uniqueFontStyles.size > 1 ? 'Mixed' : firstIntersectingItemDetails.style;
        dom.selectionFontStyle.title = Array.from(uniqueFontStyles).join('; ');

        dom.selectionFontSize.textContent = `${firstIntersectingItemFontSize.toFixed(2)} pt` + (uniqueFontSizes.size > 1 ? ' (Mixed)' : '');

        let minTextX = Infinity, maxTextX = -Infinity;

        intersectingTextItems.forEach(item => {
            const itemX = item.transform[4];
            const itemWidth = item.width;
            const itemEndX = itemX + itemWidth;

            const clippedStartX = Math.max(itemX, selectionBoxPdf.x);
            const clippedEndX = Math.min(itemEndX, selectionBoxPdf.x + selectionBoxPdf.width);
            
            if (clippedStartX < clippedEndX) {
                minTextX = Math.min(minTextX, clippedStartX);
                maxTextX = Math.max(maxTextX, clippedEndX);
            }
        });
        
        let textWidthPdfPoints = (maxTextX > minTextX) ? maxTextX - minTextX : 0;
        const displayUnit = dom.displayUnitSelector.value;
        const conversionFactorToUnit = 1 / types.unitToPoints[displayUnit];
        
        if (textWidthPdfPoints > 0) {
            const widthInUnit = (textWidthPdfPoints * conversionFactorToUnit).toFixed(2);
            if (displayUnit === 'picas') {
                dom.selectionTextW.textContent = `${widthInUnit} pc`;
            } else {
                const widthInPicas = (textWidthPdfPoints / 12).toFixed(2);
                dom.selectionTextW.textContent = `${widthInUnit} ${displayUnit} (${widthInPicas} pc)`;
            }
        } else {
            dom.selectionTextW.textContent = '--';
        }

        const sortedItems = [...intersectingTextItems].sort((a, b) => {
            if (Math.abs(b.transform[5] - a.transform[5]) > 0.1) {
                return b.transform[5] - a.transform[5];
            }
            return a.transform[4] - b.transform[4];
        });

        const lines = [];
        if (sortedItems.length > 0) {
            let currentLine = [sortedItems[0]];
            let currentLineAvgY = sortedItems[0].transform[5];

            for (let i = 1; i < sortedItems.length; i++) {
                const item = sortedItems[i];
                const fontSize = Math.abs(item.height || item.transform[3] || 10);
                const Y_TOLERANCE = fontSize * 0.4;

                if (Math.abs(item.transform[5] - currentLineAvgY) < Y_TOLERANCE) {
                    currentLine.push(item);
                    currentLineAvgY = currentLine.reduce((sum, text) => sum + text.transform[5], 0) / currentLine.length;
                } else {
                    lines.push(currentLine);
                    currentLine = [item];
                    currentLineAvgY = item.transform[5];
                }
            }
            lines.push(currentLine);
        }

        // Calculate average single-line height for Text H metric
        const lineHeights = [];
        for (const line of lines) {
            if (line.length === 0) continue;
            let minGlyphBottomY = Infinity, maxGlyphTopY = -Infinity;
            for (const item of line) {
                const baselineY = item.transform[5];
                const fontSizePoints = Math.abs(item.height || item.transform[3] || 10);
                
                let fontObj = null;
                try {
                    fontObj = page.commonObjs.get(item.fontName);
                } catch (e) {
                    if (!(e instanceof Error && e.message.includes("Requesting object that isn't resolved yet"))) {
                        console.warn(`Could not get font object '${item.fontName}':`, e);
                    }
                }
                
                let ascender, descender;
                if (fontObj && fontObj.ascent && fontObj.descent) {
                    ascender = fontObj.ascent * fontSizePoints;
                    descender = fontObj.descent * fontSizePoints;
                } else {
                    ascender = fontSizePoints * 0.75;
                    descender = -fontSizePoints * 0.25; 
                }
                
                minGlyphBottomY = Math.min(minGlyphBottomY, baselineY + descender);
                maxGlyphTopY = Math.max(maxGlyphTopY, baselineY + ascender);
            }
            if (maxGlyphTopY > minGlyphBottomY) {
                lineHeights.push(maxGlyphTopY - minGlyphBottomY);
            }
        }
        
        if (lineHeights.length > 0) {
            const averageLineHeight = lineHeights.reduce((sum, h) => sum + h, 0) / lineHeights.length;
            state.currentSelectionTextBlockHeightPdfPoints = averageLineHeight;
        } else {
            state.currentSelectionTextBlockHeightPdfPoints = null;
        }


        const averageBaselines = lines.map(line =>
            line.reduce((sum, item) => sum + item.transform[5], 0) / line.length
        );

        if (averageBaselines.length > 1) {
            const leadings = [];
            for (let i = 0; i < averageBaselines.length - 1; i++) {
                const leading = Math.abs(averageBaselines[i] - averageBaselines[i + 1]);
                if (leading > 0.1) {
                    leadings.push(leading);
                }
            }

            if (leadings.length > 0) {
                const frequencyMap = new Map();
                leadings.forEach(leading => {
                    const rounded = parseFloat(leading.toFixed(2));
                    frequencyMap.set(rounded, (frequencyMap.get(rounded) || 0) + 1);
                });

                let mostFrequentLeading = -1;
                let maxFrequency = 0;
                frequencyMap.forEach((frequency, leading) => {
                    if (frequency > maxFrequency) {
                        maxFrequency = frequency;
                        mostFrequentLeading = leading;
                    }
                });

                state.currentSelectionAutoLeadingPdfPoints = mostFrequentLeading;
                dom.selectionTextLeading.textContent = `${mostFrequentLeading.toFixed(2)} pt${frequencyMap.size > 1 ? ' (Mixed)' : ''}`;
            } else {
                state.currentSelectionAutoLeadingPdfPoints = null;
                dom.selectionTextLeading.textContent = '--';
            }
        } else if (lines.length === 1 && lines[0].length > 0) {
            // Estimate leading for a single line based on 120% of font size (a common default)
            const firstItemOfLine = lines[0][0];
            const fontSize = Math.abs(firstItemOfLine.height || firstItemOfLine.transform[3] || 10);
            const estimatedLeading = fontSize * 1.2;
            state.currentSelectionAutoLeadingPdfPoints = estimatedLeading;
            dom.selectionTextLeading.textContent = `${estimatedLeading.toFixed(2)} pt (Est.)`;
        }
        else {
            state.currentSelectionAutoLeadingPdfPoints = null;
            dom.selectionTextLeading.textContent = '--';
        }
        
        updateSelectionInfoUI(selectionRect.width, selectionRect.height);
        document.dispatchEvent(new CustomEvent('app:selection_text_extracted'));
    } catch(error) {
        console.error("Error during text extraction from selection: ", error);
        resetSelectionDetailsUI();
    }
}

export function updateLiveSelectionInfoBox(selection, clientX, clientY) {
    if (!dom.liveSelectionInfoBox || !selection) {
        if(dom.liveSelectionInfoBox) dom.liveSelectionInfoBox.classList.add('hidden');
        return;
    }

    dom.liveSelectionInfoBox.classList.remove('hidden');
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    dom.liveSelectionInfoBox.style.left = `${clientX + scrollX + 15}px`;
    dom.liveSelectionInfoBox.style.top = `${clientY + scrollY + 15}px`;

    const displayUnit = dom.displayUnitSelector.value;
    const unitLabel = displayUnit === 'picas' ? 'pc' : displayUnit;
    const conversionFactorToUnit = 1 / types.unitToPoints[displayUnit];
    const xPdfPoints = selection.x / state.zoomLevel;
    const yPdfPoints = selection.y / state.zoomLevel;
    const widthPdfPoints = selection.width / state.zoomLevel;
    const heightPdfPoints = selection.height / state.zoomLevel;

    dom.liveInfoXValue.textContent = `${(xPdfPoints * conversionFactorToUnit).toFixed(1)} ${unitLabel}`;
    dom.liveInfoYValue.textContent = `${(yPdfPoints * conversionFactorToUnit).toFixed(1)} ${unitLabel}`;
    dom.liveInfoWValue.textContent = `${(widthPdfPoints * conversionFactorToUnit).toFixed(1)} ${unitLabel}`;
    dom.liveInfoHValue.textContent = `${(heightPdfPoints * conversionFactorToUnit).toFixed(1)} ${unitLabel}`;
};

export async function redrawPersistentMeasurementsForPage(pageNumToRedraw) {
    if (!state.pdfDoc || !state.pageCanvases[pageNumToRedraw] || pageNumToRedraw !== state.currentPageNum) return; 

    const { ctxOverlay, pageWrapper } = state.pageCanvases[pageNumToRedraw];
    const page = await state.pdfDoc.getPage(pageNumToRedraw);
    const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });
    
    pageWrapper.querySelectorAll('.measurement-label').forEach(el => el.remove());

    for (const [index, m] of state.measurements.filter(m => m.page === pageNumToRedraw).entries()) {
        // Don't draw the persistent version if it's the currently active selection
        if (index === state.activeMeasurementIndex && m.page === state.currentPageNum) continue;

        const [startX1, startY1] = viewport.convertToViewportPoint(m.startPDF.x, m.startPDF.y);
        const [endX1, endY1] = viewport.convertToViewportPoint(m.endPDF.x, m.endPDF.y);
        const startCanvasPoint = { x: Math.min(startX1, endX1), y: Math.min(startY1, endY1) };
        const endCanvasPoint = { x: Math.max(startX1, endX1), y: Math.max(startY1, endY1) };
        
        drawRect(ctxOverlay, startCanvasPoint, endCanvasPoint, '#f59e0b', 0.75); // Persistent measurements are orange

        const label = document.createElement('div');
        label.classList.add('measurement-label');
        label.textContent = calculateAndFormatSelectionMeasurement(m, dom.displayUnitSelector.value); 
        pageWrapper.appendChild(label); 
        label.style.left = `${startCanvasPoint.x + (endCanvasPoint.x - startCanvasPoint.x) / 2}px`; 
        label.style.top = `${startCanvasPoint.y + (endCanvasPoint.y - startCanvasPoint.y) / 2}px`;
    }
}