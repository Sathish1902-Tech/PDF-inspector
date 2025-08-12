
// @ts-nocheck
import * as dom from './dom.js';
import { state } from './state.js';
import * as types from './types.js';

export function showModal(title, message, isConfirm = false) {
    dom.modalTitle.textContent = title;
    dom.modalMessage.innerHTML = message;
    dom.modalCancel.classList.toggle('hidden', !isConfirm);
    dom.modalOk.textContent = isConfirm ? 'OK' : 'Close';
    dom.customModal.classList.remove('hidden');

    return new Promise((resolve) => {
        const okListener = () => {
            dom.customModal.classList.add('hidden');
            dom.modalOk.removeEventListener('click', okListener);
            dom.modalCancel.removeEventListener('click', cancelListener);
            resolve(true);
        };

        const cancelListener = () => {
            dom.customModal.classList.add('hidden');
            dom.modalOk.removeEventListener('click', okListener);
            dom.modalCancel.removeEventListener('click', cancelListener);
            resolve(false);
        };

        dom.modalOk.addEventListener('click', okListener);
        dom.modalCancel.addEventListener('click', cancelListener);
    });
}

export function showStatusUpdate(message) {
    if (state.statusTimeout !== null) clearTimeout(state.statusTimeout);
    dom.statusMessage.textContent = message;
    dom.statusToast.classList.remove('opacity-0', 'translate-y-2');
    dom.statusToast.classList.add('opacity-100', 'translate-y-0');
    state.statusTimeout = window.setTimeout(() => {
        dom.statusToast.classList.remove('opacity-100', 'translate-y-0');
        dom.statusToast.classList.add('opacity-0', 'translate-y-2');
    }, 3000);
}

export const parseFontNameDetails = (rawFontName) => {
    if (!rawFontName) return { family: "Unknown", style: "Regular", weight: "normal", isSubset: false, originalName: "Unknown" };

    let name = rawFontName;
    const originalName = rawFontName;
    let isSubset = false;

    if (/^[A-Z]{6}\+/.test(name)) {
        isSubset = true;
        name = name.substring(7);
    }

    const styleKeywords = [
        'BoldItalic', 'BoldOblique', 'LightItalic', 'MediumItalic', 'SemiBoldItalic', 'ExtraBoldItalic', 'CondensedBold', 'CondensedLight', 'Black', 'Bold', 'Italic', 'Oblique', 'Light', 'Regular', 'Medium', 'Semibold', 'SemiBold', 'Demibold', 'DemiBold', 'Extrabold', 'ExtraBold', 'Heavy', 'Thin', 'Condensed', 'Cond', 'Cn', 'Extended', 'Ext', 'Book', 'Roman', 'Slanted'
    ];
    
    let family = name;
    let style = 'Regular';
    let weight = 'normal';

    const keywordMap = {
        "bold": { style: "Bold", weight: "bold" }, "italic": { style: "Italic", weight: "normal" }, "oblique": { style: "Oblique", weight: "normal" },
        "light": { style: "Light", weight: "300" }, "regular": { style: "Regular", weight: "normal" }, "medium": { style: "Medium", weight: "500" },
        "semibold": { style: "Semibold", weight: "600" }, "demibold": { style: "Demibold", weight: "600" },
        "extrabold": { style: "Extrabold", weight: "800" }, "black": { style: "Black", weight: "900" }, "heavy": { style: "Heavy", weight: "900" },
        "thin": { style: "Thin", weight: "100" }, "condensed": { style: "Condensed", weight: "normal" }, "extended": { style: "Extended", weight: "normal" },
        "book": { style: "Book", weight: "normal" }, "roman": { style: "Roman", weight: "normal" }, "slanted": { style: "Slanted", weight: "normal" }
    };

    const parts = name.split(/[-_,\s]+/);
    const familyParts = [];
    const styleParts = [];

    for (const part of parts) {
        const lowerPart = part.toLowerCase();
        let foundKeyword = false;
        for (const keyword of Object.keys(keywordMap)) {
            if (lowerPart.includes(keyword)) {
                if(lowerPart === keyword || lowerPart === 'italic' || lowerPart === 'oblique') {
                    styleParts.push(part);
                    foundKeyword = true;
                    break;
                }
            }
        }
        if (!foundKeyword) {
            familyParts.push(part);
        }
    }

    if (familyParts.length > 0) {
        family = familyParts.join(' ');
    }

    if (styleParts.length > 0) {
        style = styleParts.join(' ');
        const lowerStyle = style.toLowerCase();
        if (lowerStyle.includes('bold')) weight = 'bold';
        if (lowerStyle.includes('light')) weight = '300';
        if (lowerStyle.includes('medium')) weight = '500';
        if (lowerStyle.includes('semibold') || lowerStyle.includes('demibold')) weight = '600';
        if (lowerStyle.includes('extrabold')) weight = '800';
        if (lowerStyle.includes('black') || lowerStyle.includes('heavy')) weight = '900';
    }

    if (familyParts.length === parts.length) {
        for (const keyword of styleKeywords) {
            const regex = new RegExp(`[-_]${keyword}$`, 'i');
            if (regex.test(family)) {
                const match = family.match(regex);
                if (match) {
                    style = match[0].replace(/[-_]/, '');
                    family = family.replace(regex, '');
                    break;
                }
            }
        }
    }

    family = family.replace(/MT$|PSMT$|PS$/, '').trim();

    return { family, style, weight, isSubset, originalName };
};

export function clearColumnAnalysisState() {
    state.columnAnalysis = { leftColumnBox: null, rightColumnBox: null, gutterBox: null };
    if (dom.columnAnalysisResults) {
        dom.columnAnalysisResults.classList.add('hidden');
    }
}

export const getCanvasMousePos = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

export const drawRect = (ctx, start, end, color = '#ef4444', lineWidth = 1) => {
    ctx.beginPath();
    const width = end.x - start.x;
    const height = end.y - start.y;
    ctx.rect(start.x, start.y, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
};

export const calculateAndFormatSelectionMeasurement = (measurement, displayUnit) => {
    const widthInPdfPoints = Math.abs(measurement.endPDF.x - measurement.startPDF.x);
    const heightInPdfPoints = Math.abs(measurement.endPDF.y - measurement.startPDF.y);
    const conversionFactorToUnit = 1 / types.unitToPoints[displayUnit];
    const widthInUnits = widthInPdfPoints * conversionFactorToUnit;
    const heightInUnits = heightInPdfPoints * conversionFactorToUnit;
    const unitLabel = displayUnit === 'picas' ? 'pc' : displayUnit;
    return `W: ${widthInUnits.toFixed(2)} ${unitLabel}, H: ${heightInUnits.toFixed(2)} ${unitLabel}`;
};