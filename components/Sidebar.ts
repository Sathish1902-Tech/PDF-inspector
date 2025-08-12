// @ts-nocheck
import * as dom from './dom.js';
import * as types from './types.js';
import { state } from './state.js';
import { showModal, clearColumnAnalysisState, parseFontNameDetails, calculateAndFormatSelectionMeasurement } from './utils.js';
import { setupPageNavigation } from './navigation.js';
import { redrawCurrentPageOverlay } from './PdfRenderer.js';
import { extractTextFromSelection, activateMeasurement, updateSelectionInfoUI } from './SelectionManager.js';
import { extractAllFontsFromDoc } from './FontUtils.js';

async function analyzeColumns(textContent, selectionBoxPdf) {
    if (!textContent || !selectionBoxPdf) return null;

    const itemsInSelection = textContent.items.filter(item => {
        if (item.str.trim().length === 0 || item.width <= 0) return false;

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

        return (
            selectionBoxPdf.x < itemBoxPdf.x + itemBoxPdf.width &&
            selectionBoxPdf.x + selectionBoxPdf.width > itemBoxPdf.x &&
            selectionBoxPdf.y < itemBoxPdf.y + itemBoxPdf.height &&
            selectionBoxPdf.y + selectionBoxPdf.height > itemBoxPdf.y
        );
    });

    if (itemsInSelection.length < 5) {
        return null;
    }

    let overallMinX = Infinity, overallMaxX = -Infinity, overallMinY = Infinity, overallMaxY = -Infinity;
    itemsInSelection.forEach(item => {
        const baselineY = item.transform[5];
        const height = Math.abs(item.height || item.transform[3] || 10);
        const itemStartX = item.transform[4];
        const itemEndX = itemStartX + item.width;
        
        overallMinX = Math.min(overallMinX, itemStartX);
        overallMaxX = Math.max(overallMaxX, itemEndX);
        overallMinY = Math.min(overallMinY, baselineY - (height * 0.8));
        overallMaxY = Math.max(overallMaxY, baselineY + (height * 0.3));
    });
    const overallTextHeight = overallMaxY - overallMinY;
    const overallTextWidth = overallMaxX - overallMinX;

    if (overallTextWidth <= 0) {
        return null;
    }

    const analysisWidth = Math.ceil(overallTextWidth);
    const projection = new Array(analysisWidth).fill(0);

    for (const item of itemsInSelection) {
        const relative_x_start = Math.floor(item.transform[4] - overallMinX);
        const item_width = Math.ceil(item.width);
        for (let i = 0; i < item_width; i++) {
            const projIndex = relative_x_start + i;
            if (projIndex >= 0 && projIndex < analysisWidth) {
                projection[projIndex]++;
            }
        }
    }

    const GUTTER_DENSITY_THRESHOLD = 1;
    const searchStart = Math.floor(analysisWidth * 0.1);
    const searchEnd = Math.floor(analysisWidth * 0.9);
    let maxGap = 0, gutterStartRelativeX = -1, currentGap = 0, currentGapStart = -1;

    for (let i = searchStart; i < searchEnd; i++) {
        if (projection[i] < GUTTER_DENSITY_THRESHOLD) {
            if (currentGapStart === -1) currentGapStart = i;
            currentGap++;
        } else {
            if (currentGap > maxGap) {
                maxGap = currentGap;
                gutterStartRelativeX = currentGapStart;
            }
            currentGap = 0;
            currentGapStart = -1;
        }
    }
    if (currentGap > maxGap) {
        maxGap = currentGap;
        gutterStartRelativeX = currentGapStart;
    }

    const MIN_GUTTER_WIDTH = 5; // points
    if (gutterStartRelativeX === -1 || maxGap < MIN_GUTTER_WIDTH) {
        return null;
    }
    
    const gutterStartAbsoluteX = overallMinX + gutterStartRelativeX;
    const splitX = gutterStartAbsoluteX + (maxGap / 2);

    const leftColumnItems = itemsInSelection.filter(item => item.transform[4] < splitX);
    const rightColumnItems = itemsInSelection.filter(item => item.transform[4] >= splitX);

    if (leftColumnItems.length === 0 || rightColumnItems.length === 0) {
        return null;
    }
    
    const leftBounds = leftColumnItems.reduce((acc, item) => {
        acc.minX = Math.min(acc.minX, item.transform[4]);
        acc.maxX = Math.max(acc.maxX, item.transform[4] + item.width);
        return acc;
    }, { minX: Infinity, maxX: -Infinity });

    const rightBounds = rightColumnItems.reduce((acc, item) => {
        acc.minX = Math.min(acc.minX, item.transform[4]);
        acc.maxX = Math.max(acc.maxX, item.transform[4] + item.width);
        return acc;
    }, { minX: Infinity, maxX: -Infinity });

    if (leftBounds.minX === Infinity || rightBounds.minX === Infinity) {
        return null;
    }
    
    const gutterWidth = Math.max(0, rightBounds.minX - leftBounds.maxX);

    return {
        leftColumnBox: {
            x: leftBounds.minX,
            y: overallMinY,
            width: leftBounds.maxX - leftBounds.minX,
            height: overallTextHeight
        },
        rightColumnBox: {
            x: rightBounds.minX,
            y: overallMinY,
            width: rightBounds.maxX - rightBounds.minX,
            height: overallTextHeight
        },
        gutterBox: {
            x: leftBounds.maxX,
            y: overallMinY,
            width: gutterWidth,
            height: overallTextHeight
        }
    };
}

export function initSidebar() {
    setupPageNavigation();
    dom.displayUnitSelector.addEventListener('change', onDisplayUnitChange);
    dom.clearMeasurementsBtn.addEventListener('click', onClearMeasurements);
    dom.analyzePageBtn.addEventListener('click', onAnalyzePage);
    dom.measureColumnsBtn.addEventListener('click', onMeasureColumns);
    dom.generateSpecsBtn.addEventListener('click', onGenerateSpecs);
    dom.clearColumnHighlightsBtn.addEventListener('click', async () => {
        clearColumnAnalysisState();
        await redrawCurrentPageOverlay();
    });
    dom.manualLeadingInput.addEventListener('input', updateTextHLeadingRatioDisplay);
    document.addEventListener('app:measurement_updated', updateMeasurementsList);
    document.addEventListener('app:selection_text_extracted', updateTextHLeadingRatioDisplay);
}

const isValidBox = (box) => {
    // Check if it's an array or array-like (like a typed array) of length 4.
    return box && typeof box.length !== 'undefined' && box.length === 4;
};

export const updatePageDimensionsUI = (page) => {
    if (!page) {
        dom.pageTrimMmDisplay.textContent = 'N/A';
        dom.pageTrimInDisplay.textContent = 'N/A';
        dom.pageSourceBoxDisplay.textContent = 'Unknown';
        return;
    }

    let boxToUse = null;
    let sourceBoxName = '';

    // Prioritize TrimBox, then CropBox, then MediaBox.
    if (isValidBox(page.trimBox)) {
        boxToUse = page.trimBox;
        sourceBoxName = 'TrimBox';
    } else if (isValidBox(page.cropBox)) {
        boxToUse = page.cropBox;
        sourceBoxName = 'CropBox';
    } else if (isValidBox(page.mediaBox)) {
        boxToUse = page.mediaBox;
        sourceBoxName = 'MediaBox';
    } else if (isValidBox(page.view)) {
        // Fallback to page.view which is cropBox or mediaBox.
        // This is a robust fallback as pdf.js must have a view to render.
        boxToUse = page.view;
        sourceBoxName = 'View (from PDF)';
    }

    if (boxToUse) {
        // Using Array.from to handle both arrays and typed arrays gracefully.
        const boxArray = Array.from(boxToUse);
        const [llx, lly, urx, ury] = boxArray;
        const wPt = urx - llx;
        const hPt = ury - lly;
        
        const wIn = wPt / types.POINTS_PER_INCH;
        const hIn = hPt / types.POINTS_PER_INCH;
        const wMm = wIn * types.MM_PER_INCH;
        const hMm = hIn * types.MM_PER_INCH;

        dom.pageTrimMmDisplay.textContent = `${wMm.toFixed(2)} x ${hMm.toFixed(2)} mm`;
        dom.pageTrimInDisplay.textContent = `${wIn.toFixed(2)} x ${hIn.toFixed(2)} in`;
        
        const boxCoords = boxArray.map(n => parseFloat(n.toFixed(2))).join(', ');
        dom.pageSourceBoxDisplay.textContent = `${sourceBoxName} [${boxCoords}]`;
    } else {
        // Final fallback if nothing works.
        dom.pageTrimMmDisplay.textContent = 'N/A';
        dom.pageTrimInDisplay.textContent = 'N/A';
        dom.pageSourceBoxDisplay.textContent = 'Unknown';
    }
};


function onDisplayUnitChange() {
    updateMeasurementsList();
    if (state.currentSelection) {
        updateSelectionInfoUI(state.currentSelection.width, state.currentSelection.height);
        extractTextFromSelection(state.currentSelection); // Re-run to update text width in new units
    }
     // If column analysis is visible, update its units too
    if (!dom.columnAnalysisResults.classList.contains('hidden') && state.columnAnalysis.leftColumnBox) {
        const getUnitLabel = (unit) => {
            switch (unit) {
                case 'picas': return 'pc';
                case 'inches': return 'in';
                case 'millimeters': return 'mm';
                default: return unit;
            }
        };
        const displayUnit = dom.displayUnitSelector.value;
        const unitLabel = getUnitLabel(displayUnit);
        const conversion = 1 / types.unitToPoints[displayUnit];
        const gutterWidth = state.columnAnalysis.gutterBox.width;

        dom.leftColumnWidth.textContent = `${(state.columnAnalysis.leftColumnBox.width * conversion).toFixed(2)} ${unitLabel}`;
        dom.rightColumnWidth.textContent = `${(state.columnAnalysis.rightColumnBox.width * conversion).toFixed(2)} ${unitLabel}`;
        dom.gutterSpace.textContent = `${(gutterWidth * conversion).toFixed(2)} ${unitLabel}`;
    }
}

function onClearMeasurements() {
    if (confirm('Are you sure you want to clear all measurements?')) {
        state.measurements = [];
        updateMeasurementsList();
        clearCurrentSelectionState();
        redrawCurrentPageOverlay();
    }
}

export function updateMeasurementsList() {
    const displayUnit = dom.displayUnitSelector.value;
    dom.measurementsListElement.innerHTML = '';
    if (state.measurements.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No measurements yet. Draw a selection on the page.';
        li.className = 'text-sm text-gray-500 italic';
        dom.measurementsListElement.appendChild(li);
        dom.clearMeasurementsBtn.classList.add('hidden');
        return;
    }

    dom.clearMeasurementsBtn.classList.remove('hidden');
    state.measurements.forEach((m, index) => {
        const li = document.createElement('li');
        li.className = 'p-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition';
        if (index === state.activeMeasurementIndex) {
            li.classList.add('selected');
        }

        const text = `Page ${m.page}: ${calculateAndFormatSelectionMeasurement(m, displayUnit)}`;
        li.textContent = text;
        li.addEventListener('click', () => activateMeasurement(index));
        dom.measurementsListElement.appendChild(li);
    });
}


const onAnalyzePage = async () => {
    if (!state.pdfDoc) return;
    dom.pageAnalysisLoader.classList.remove('hidden');
    dom.pageAnalysisResults.classList.add('hidden');
    
    try {
        const page = await state.pdfDoc.getPage(state.currentPageNum);
        const textContent = await page.getTextContent();
        const words = textContent.items.map(item => item.str).join(' ').trim().split(/\s+/).filter(Boolean);
        const lines = new Set(textContent.items.map(item => item.transform[5])); 
        
        dom.linesCount.textContent = lines.size;
        dom.wordsCount.textContent = words.length;
        dom.pageAnalysisResults.classList.remove('hidden');
    } catch (e) {
        console.error('Error analyzing page:', e);
        showModal('Error', 'Could not analyze page content.');
    } finally {
        dom.pageAnalysisLoader.classList.add('hidden');
    }
};

const onMeasureColumns = async () => {
    if (!state.pdfDoc) return;

    const selection = state.currentSelection;
    if (!selection || selection.width < 10 || selection.height < 10) {
        await showModal('Select Area First', 'Please draw a selection box around the columns you want to measure, then click "Measure Columns".');
        return;
    }

    dom.pageAnalysisLoader.classList.remove('hidden');
    dom.columnAnalysisResults.classList.add('hidden');
    clearColumnAnalysisState();

    try {
        const page = await state.pdfDoc.getPage(state.currentPageNum);
        const textContent = await page.getTextContent();
        
        const viewport = page.getViewport({ scale: state.zoomLevel, rotation: state.currentRotation });
        const [selPdfX1, selPdfY1] = viewport.convertToPdfPoint(selection.x, selection.y);
        const [selPdfX2, selPdfY2] = viewport.convertToPdfPoint(selection.x + selection.width, selection.y + selection.height);
        const selectionBoxPdf = {
            x: Math.min(selPdfX1, selPdfX2),
            y: Math.min(selPdfY1, selPdfY2),
            width: Math.abs(selPdfX2 - selPdfX1),
            height: Math.abs(selPdfY2 - selPdfY1),
        };

        const columnData = await analyzeColumns(textContent, selectionBoxPdf);
        
        if (!columnData) {
            showModal('Column Analysis', 'Could not detect a clear gutter with two columns of text.');
            dom.pageAnalysisLoader.classList.add('hidden');
            return;
        }

        state.columnAnalysis = columnData;
        
        const getUnitLabel = (unit) => ({ 'picas': 'pc', 'inches': 'in', 'millimeters': 'mm' }[unit] || unit);
        const displayUnit = dom.displayUnitSelector.value;
        const unitLabel = getUnitLabel(displayUnit);
        const conversion = 1 / types.unitToPoints[displayUnit];

        dom.leftColumnWidth.textContent = `${(state.columnAnalysis.leftColumnBox.width * conversion).toFixed(2)} ${unitLabel}`;
        dom.rightColumnWidth.textContent = `${(state.columnAnalysis.rightColumnBox.width * conversion).toFixed(2)} ${unitLabel}`;
        dom.gutterSpace.textContent = `${(state.columnAnalysis.gutterBox.width * conversion).toFixed(2)} ${unitLabel}`;
        dom.columnAnalysisResults.classList.remove('hidden');
        
        await redrawCurrentPageOverlay();
    } catch(e) {
        console.error('Error measuring columns:', e);
        showModal('Error', 'An error occurred during column analysis.');
    } finally {
        dom.pageAnalysisLoader.classList.add('hidden');
    }
};

export const onGenerateSpecs = async () => {
    if (!state.pdfDoc) return;
    dom.autoSpecsLoader.classList.remove('hidden');
    dom.autoSpecsResults.classList.add('hidden');
    // Reset column data UI
    dom.specColumnData.classList.add('hidden');
    dom.specLeftColWidth.textContent = '--';
    dom.specRightColWidth.textContent = '--';
    dom.specGutterSpace.textContent = '--';


    try {
        const page = await state.pdfDoc.getPage(state.currentPageNum);
        const textContent = await page.getTextContent();
        if (!textContent || textContent.items.length === 0) {
            await showModal('Analysis Complete', 'No text content found on this page.');
            dom.autoSpecsLoader.classList.add('hidden');
            return;
        }

        // --- Column Analysis ---
        const analysisAreaPdf = textContent.items.reduce((acc, item) => {
            if (item.str.trim().length === 0) return acc;
            const baselineY = item.transform[5];
            const height = Math.abs(item.height || item.transform[3] || 10);
            const itemStartX = item.transform[4];
            const itemEndX = itemStartX + item.width;

            acc.minX = Math.min(acc.minX, itemStartX);
            acc.maxX = Math.max(acc.maxX, itemEndX);
            acc.minY = Math.min(acc.minY, baselineY - height * 0.8);
            acc.maxY = Math.max(acc.maxY, baselineY + height * 0.3);
            return acc;
        }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

        const selectionBoxPdf = {
            x: analysisAreaPdf.minX,
            y: analysisAreaPdf.minY,
            width: analysisAreaPdf.maxX - analysisAreaPdf.minX,
            height: analysisAreaPdf.maxY - analysisAreaPdf.minY
        };

        if (selectionBoxPdf.width > 0 && selectionBoxPdf.height > 0) {
            const columnData = await analyzeColumns(textContent, selectionBoxPdf);

            if (columnData) {
                const { leftColumnBox, rightColumnBox, gutterBox } = columnData;
                dom.specLeftColWidth.textContent = `${(leftColumnBox.width / 12).toFixed(2)} pc`;
                dom.specRightColWidth.textContent = `${(rightColumnBox.width / 12).toFixed(2)} pc`;
                dom.specGutterSpace.textContent = `${(gutterBox.width / 12).toFixed(2)} pc`;
                dom.specColumnData.classList.remove('hidden');
            }
        }
        // --- End Column Analysis ---


        // --- 1. Find Primary Font Size ---
        const fontSizes = new Map();
        textContent.items.forEach(item => {
            if (item.str.trim().length === 0) return;
            const size = parseFloat(Math.abs(item.height || item.transform[3] || 10).toFixed(2));
            fontSizes.set(size, (fontSizes.get(size) || 0) + 1);
        });

        if (fontSizes.size === 0) {
            await showModal('Analysis Complete', 'Could not determine font sizes from text content.');
            dom.autoSpecsLoader.classList.add('hidden');
            return;
        }

        let mostFrequentSize = 0, maxCount = 0;
        fontSizes.forEach((count, size) => {
            if (count > maxCount) {
                maxCount = count;
                mostFrequentSize = size;
            }
        });
        
        // --- 2. Group All Text into Lines ---
        const sortedItems = [...textContent.items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
        const allLines = [];
        if (sortedItems.length > 0) {
            let currentLine = [sortedItems[0]];
            let currentLineAvgY = sortedItems[0].transform[5];
            for (let i = 1; i < sortedItems.length; i++) {
                const item = sortedItems[i];
                const Y_TOLERANCE = Math.abs(item.height || item.transform[3] || 10) * 0.4;
                if (Math.abs(item.transform[5] - currentLineAvgY) < Y_TOLERANCE) {
                    currentLine.push(item);
                    currentLineAvgY = currentLine.reduce((sum, text) => sum + text.transform[5], 0) / currentLine.length;
                } else {
                    allLines.push(currentLine);
                    currentLine = [item];
                    currentLineAvgY = item.transform[5];
                }
            }
            allLines.push(currentLine);
        }

        // Filter for lines containing the primary font size
        const primaryFontLines = allLines.filter(line => 
            line.some(item => parseFloat(Math.abs(item.height || item.transform[3] || 10).toFixed(2)) === mostFrequentSize)
        );

        // --- 3. Identify Main Text Block (the largest group of contiguous lines) ---
        if (primaryFontLines.length === 0) {
            await showModal('Analysis Failed', 'Could not identify a primary text block.');
            dom.autoSpecsLoader.classList.add('hidden');
            return;
        }
        
        const lineBaselines = primaryFontLines.map(line => line.reduce((sum, item) => sum + item.transform[5], 0) / line.length);
        const leadings = [];
        for (let i = 0; i < lineBaselines.length - 1; i++) {
            leadings.push(Math.abs(lineBaselines[i] - lineBaselines[i + 1]));
        }

        let medianLeading = 0;
        if (leadings.length > 0) {
            const sortedLeadings = [...leadings].sort((a, b) => a - b);
            const mid = Math.floor(sortedLeadings.length / 2);
            medianLeading = sortedLeadings.length % 2 !== 0 ? sortedLeadings[mid] : (sortedLeadings[mid - 1] + sortedLeadings[mid]) / 2;
        }

        const textBlocks = [];
        if (primaryFontLines.length > 0) {
            let currentBlock = [primaryFontLines[0]];
            for (let i = 0; i < leadings.length; i++) {
                if (leadings[i] > medianLeading * 1.5 && medianLeading > 0) {
                    textBlocks.push(currentBlock);
                    currentBlock = [];
                }
                currentBlock.push(primaryFontLines[i + 1]);
            }
            if (currentBlock.length > 0) textBlocks.push(currentBlock);
        }

        const mainBlockIndex = textBlocks.reduce((maxIndex, block, index, arr) => block.length > arr[maxIndex].length ? index : maxIndex, 0);
        const mainTextBlockLines = textBlocks[mainBlockIndex];

        if (!mainTextBlockLines || mainTextBlockLines.length === 0) {
            await showModal('Analysis Failed', 'Could not identify a main text block.');
            dom.autoSpecsLoader.classList.add('hidden');
            return;
        }

        // --- Determine Primary Font from the Main Text Block ---
        const mainBlockItems = mainTextBlockLines.flat();
        const mainBlockFontCounts = new Map();
        mainBlockItems.forEach(item => {
            if (item.str.trim().length === 0) return;
            mainBlockFontCounts.set(item.fontName, (mainBlockFontCounts.get(item.fontName) || 0) + item.str.length);
        });

        let primaryFontId = '';
        let maxCharCount = 0;
        mainBlockFontCounts.forEach((count, fontId) => {
            if (count > maxCharCount) {
                maxCharCount = count;
                primaryFontId = fontId;
            }
        });
        
        if (state.allDocumentFonts.length === 0) await extractAllFontsFromDoc();
        
        const primaryFontObj = state.allDocumentFonts.find(f => f.id === primaryFontId);
        const primaryFontName = primaryFontObj ? primaryFontObj.name : primaryFontId;
        const primaryFontDetails = parseFontNameDetails(primaryFontName || '');
        const primaryFontDisplay = `${primaryFontDetails.family}, ${primaryFontDetails.style}`;
        
        const allFontIdsInBlock = [...new Set(mainBlockItems.map(item => item.fontName))];
        const allFontNamesInBlock = allFontIdsInBlock.map(id => state.allDocumentFonts.find(f => f.id === id)?.name || id);

        // --- 4. Calculate Specs for the Main Text Block ---
        const lineCoordinates = mainTextBlockLines.map(line => {
            const minX = Math.min(...line.map(item => item.transform[4]));
            const maxX = Math.max(...line.map(item => item.transform[4] + item.width));
            return { start: minX, end: maxX, length: maxX - minX };
        });

        const lineLengths = lineCoordinates.map(l => l.length).sort((a,b) => a-b);
        const medianLength = lineLengths[Math.floor(lineLengths.length/2)] || 0;
        const lengthVariation = lineLengths.length > 1 ? (lineLengths[lineLengths.length-1] - lineLengths[0]) / medianLength : 0;
        
        let textBlockWidth;
        if (lengthVariation < 0.1 && lineLengths.length > 3) {
            const getMostFrequent = (numbers) => {
                const counts = new Map();
                numbers.forEach(num => {
                    const key = num.toFixed(1);
                    counts.set(key, (counts.get(key) || 0) + 1);
                });
                let mostFrequent = 0, maxFreq = 0;
                for (const [val, count] of counts.entries()) {
                    if (count > maxFreq) {
                        maxFreq = count;
                        mostFrequent = parseFloat(val);
                    }
                }
                return { value: mostFrequent, count: maxFreq };
            };
            const mostFrequentStart = getMostFrequent(lineCoordinates.map(c => c.start));
            const mostFrequentEnd = getMostFrequent(lineCoordinates.map(c => c.end));

            textBlockWidth = mostFrequentEnd.value - mostFrequentStart.value;

        } else {
            textBlockWidth = Math.max(...lineCoordinates.map(line => line.length));
        }

        const totalLines = mainTextBlockLines.length;

        const mainLeadings = [];
        const mainBaselines = mainTextBlockLines.map(line => line.reduce((sum, item) => sum + item.transform[5], 0) / line.length);
        for (let i = 0; i < mainBaselines.length - 1; i++) {
            mainLeadings.push(Math.abs(mainBaselines[i] - mainBaselines[i + 1]));
        }

        let primaryLeading = 0;
        if (mainLeadings.length > 0) {
            const leadingCounts = new Map();
            mainLeadings.forEach(l => {
                const key = l.toFixed(1); // Use less precision for grouping
                leadingCounts.set(key, (leadingCounts.get(key) || 0) + 1);
            });
            let maxLeadingCount = 0;
            leadingCounts.forEach((count, leading) => {
                if (count > maxLeadingCount) {
                    maxLeadingCount = count;
                    primaryLeading = parseFloat(leading);
                }
            });
        }

        const { width, height } = page.getViewport({ scale: 1 });
        const wInRaw = width / types.POINTS_PER_INCH;
        const hInRaw = height / types.POINTS_PER_INCH;
        const wMm = (wInRaw * types.MM_PER_INCH).toFixed(2);
        const hMm = (hInRaw * types.MM_PER_INCH).toFixed(2);
        const wIn = wInRaw.toFixed(2);
        const hIn = hInRaw.toFixed(2);

        // --- 5. Calculate Text Depth based on user rule ---
        let textBlockMinY = Infinity, textBlockMaxY = -Infinity;
        mainTextBlockLines.forEach(line => {
            line.forEach(item => {
                const y = item.transform[5];
                const itemHeight = Math.abs(item.height || item.transform[3]);
                // This gives a good approximation of the visual block height from top baseline to bottom of characters.
                textBlockMinY = Math.min(textBlockMinY, y - itemHeight);
                textBlockMaxY = Math.max(textBlockMaxY, y);
            });
        });
        const textBlockHeight = textBlockMaxY - textBlockMinY;

        let textDepthFinalValue = totalLines; // Fallback to total lines
        if (primaryLeading > 0 && textBlockHeight > 0) {
            // The user's rule: height of the text block divided by the primary leading.
            textDepthFinalValue = textBlockHeight / primaryLeading;
        }

        dom.specTrimSize.textContent = `${wMm} x ${hMm} mm (${wIn}" x ${hIn}")`;
        dom.specFontFamily.textContent = primaryFontDisplay;
        dom.specFontFamily.title = allFontNamesInBlock.join('; ');
        dom.specFontSize.textContent = `${mostFrequentSize.toFixed(2)} pt`;
        dom.specLeading.textContent = `${primaryLeading.toFixed(2)} pt`;
        dom.specTextWidth.textContent = `${textBlockWidth.toFixed(2)} pt (${(textBlockWidth / 12).toFixed(2)} pc)`;
        dom.specTextDepth.textContent = `${textDepthFinalValue.toFixed(2)} lines`;
        dom.specLinesOnPage.textContent = `${totalLines} lines`;

    } catch(e) {
        console.error('Error generating specs:', e);
        showModal('Error', `Could not generate specs. ${e.message}`);
    } finally {
        dom.autoSpecsLoader.classList.add('hidden');
        dom.autoSpecsResults.classList.remove('hidden');
    }
};

export function updateTextHLeadingRatioDisplay() {
    const manualLeadingInputVal = dom.manualLeadingInput.value;
    const manualLeading = parseFloat(manualLeadingInputVal);
    
    let textHeight = null;
    if (state.currentSelection && state.zoomLevel > 0) {
        // Use selection box height ("Box H") in PDF points.
        textHeight = state.currentSelection.height / state.zoomLevel;
    }

    let leadingToUse = state.currentSelectionAutoLeadingPdfPoints;

    if (!isNaN(manualLeading) && manualLeading > 0) {
        leadingToUse = manualLeading;
    }

    if (textHeight && leadingToUse && textHeight > 0 && leadingToUse > 0) {
        const ratio = textHeight / leadingToUse;
        const textHeightPt = textHeight.toFixed(1);
        const leadingPt = leadingToUse.toFixed(1);
        // Display Box H and Lead values, along with the ratio.
        dom.selectionTextHLeadingRatio.textContent = `${textHeightPt}pt / ${leadingPt}pt (${ratio.toFixed(2)})`;
    } else {
        dom.selectionTextHLeadingRatio.textContent = '--';
    }
}