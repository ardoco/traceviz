import * as vscode from 'vscode';
import { VizColor } from '../types';
import {
    CONSTANTS_COLOR_HEX_BLUE,
    CONSTANTS_COLOR_HEX_RED,
    CONSTANTS_COLOR_HEX_ORANGE,
    CONSTANTS_COLOR_HEX_GREEN,
    CONSTANTS_NUMBER_SVG_WIDTH,
    CONSTANTS_NUMBER_SVG_HEIGHT,
    CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_Y,
    CONSTANTS_NUMBER_SVG_CIRCLE_RADIUS,
    CONSTANTS_NUMBER_SVG_CIRCLE_STROKE_WIDTH,
    CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SINGLE,
    CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_FIRST,
    CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SECOND,
    CONSTANTS_STRING_SVG_NAMESPACE,
    CONSTANTS_STRING_SVG_DATA_URI_PREFIX
} from '../constants';

/**
 * The single color palette of TraceViz. Gutter dots, overview ruler marks, explorer badges,
 * Quick Pick and tree icons all take their colors from here. The theme color IDs are
 * contributed in package.json (`contributes.colors`) with the same hex values as defaults.
 */

/** All set colors, in cycling order */
export const VIZ_COLORS: readonly VizColor[] = ['blue', 'red', 'orange', 'green'];

/** Hex value of each set color */
export const COLOR_HEX: Record<VizColor, string> = {
    blue: CONSTANTS_COLOR_HEX_BLUE,
    red: CONSTANTS_COLOR_HEX_RED,
    orange: CONSTANTS_COLOR_HEX_ORANGE,
    green: CONSTANTS_COLOR_HEX_GREEN
};

/** Neutral gray for documentation lines that no active set links */
export const UNLINKED_HEX = '#8b949e';

/** Theme color ID of the unlinked-sentence marker (contributed in package.json) */
export const UNLINKED_THEME_COLOR_ID = 'traceViz.unlinked';

/** Normalizes an unknown color value to a palette color (blue as fallback) */
export function toVizColor(color: unknown): VizColor {
    return VIZ_COLORS.includes(color as VizColor) ? color as VizColor : 'blue';
}

/** Hex value of a set color */
export function colorHex(color: VizColor): string {
    return COLOR_HEX[toVizColor(color)];
}

/** Theme color of a set color (contributed as `traceViz.<color>`) */
export function themeColor(color: VizColor): vscode.ThemeColor {
    return new vscode.ThemeColor(`traceViz.${toVizColor(color)}`);
}

function svg(content: string): string {
    return `<svg width="${CONSTANTS_NUMBER_SVG_WIDTH}" height="${CONSTANTS_NUMBER_SVG_HEIGHT}" viewBox="0 0 ${CONSTANTS_NUMBER_SVG_WIDTH} ${CONSTANTS_NUMBER_SVG_HEIGHT}" xmlns="${CONSTANTS_STRING_SVG_NAMESPACE}">${content}</svg>`;
}

function circle(cx: number, hex: string): string {
    return `<circle cx="${cx}" cy="${CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_Y}" r="${CONSTANTS_NUMBER_SVG_CIRCLE_RADIUS}" fill="${hex}" stroke="${hex}" stroke-width="${CONSTANTS_NUMBER_SVG_CIRCLE_STROKE_WIDTH}"/>`;
}

function toDataUriString(svgText: string): string {
    return CONSTANTS_STRING_SVG_DATA_URI_PREFIX + btoa(svgText);
}

function toDataUri(svgText: string): vscode.Uri {
    return vscode.Uri.parse(toDataUriString(svgText));
}

/**
 * SVG with one dot per color (at most two, side by side)
 * @param colors Set colors in display order
 */
export function dotsSvg(colors: VizColor[]): string {
    const hexes = Array.from(new Set(colors)).slice(0, 2).map(colorHex);
    const positions = hexes.length === 1
        ? [CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SINGLE]
        : [CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_FIRST, CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SECOND];
    return svg(hexes.map((hex, i) => circle(positions[i], hex)).join(''));
}

/**
 * Data URI of a dot icon in the given set colors. Used where ThemeIcon colors are not applied
 * (Quick Pick, selected tree items) and in Markdown hovers; works on desktop and in the browser.
 * @param colors One or two set colors
 */
export function dotIconUri(colors: VizColor | VizColor[]): vscode.Uri {
    return toDataUri(dotsSvg(Array.isArray(colors) ? colors : [colors]));
}

/** Data URI of a hollow gray ring, the gutter marker of unlinked documentation lines */
export function hollowDotIconUri(): vscode.Uri {
    const c = CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SINGLE;
    return toDataUri(svg(`<circle cx="${c}" cy="${CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_Y}" r="${CONSTANTS_NUMBER_SVG_CIRCLE_RADIUS}" fill="none" stroke="${UNLINKED_HEX}" stroke-width="1.2"/>`));
}

/**
 * Markdown image of a dot in the given set colors, for hovers and tooltips
 * @param colors One or two set colors
 */
export function dotMarkdown(colors: VizColor | VizColor[]): string {
    const list = Array.isArray(colors) ? colors : [colors];
    return `![${list.join(' and ')}](${toDataUriString(dotsSvg(list))}|width=14,height=14)`;
}
