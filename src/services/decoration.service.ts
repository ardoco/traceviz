import * as vscode from 'vscode';
import { VizColor } from '../types';
import {
    CONSTANTS_NUMBER_SVG_WIDTH,
    CONSTANTS_NUMBER_SVG_HEIGHT,
    CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_X,
    CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_Y,
    CONSTANTS_NUMBER_SVG_CIRCLE_RADIUS,
    CONSTANTS_NUMBER_SVG_CIRCLE_STROKE_WIDTH,
    CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SINGLE,
    CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_FIRST,
    CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SECOND,
    CONSTANTS_NUMBER_MAX_COLORS_COMPOSITE,
    CONSTANTS_COLOR_HEX_BLUE,
    CONSTANTS_COLOR_HEX_RED,
    CONSTANTS_COLOR_HEX_ORANGE,
    CONSTANTS_COLOR_HEX_GREEN,
    CONSTANTS_STRING_SVG_NAMESPACE,
    CONSTANTS_STRING_SVG_DATA_URI_PREFIX
} from '../constants';

/**
 * Service for creating text editor decorations
 */
export class DecorationService {
    /**
     * Creates a gutter dot decoration with the specified color
     * @param colorHex Hex color code (e.g., '#1f6feb')
     * @returns Text editor decoration type
     */
    static createGutterDot(colorHex: string): vscode.TextEditorDecorationType {
        const svg = `<svg width="${CONSTANTS_NUMBER_SVG_WIDTH}" height="${CONSTANTS_NUMBER_SVG_HEIGHT}" viewBox="0 0 ${CONSTANTS_NUMBER_SVG_WIDTH} ${CONSTANTS_NUMBER_SVG_HEIGHT}" xmlns="${CONSTANTS_STRING_SVG_NAMESPACE}"><circle cx="${CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_X}" cy="${CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_Y}" r="${CONSTANTS_NUMBER_SVG_CIRCLE_RADIUS}" fill="${colorHex}" stroke="${colorHex}" stroke-width="${CONSTANTS_NUMBER_SVG_CIRCLE_STROKE_WIDTH}"/></svg>`;
        const uri = vscode.Uri.parse(CONSTANTS_STRING_SVG_DATA_URI_PREFIX + Buffer.from(svg).toString('base64'));
        return vscode.window.createTextEditorDecorationType({ gutterIconPath: uri, gutterIconSize: 'contain' });
    }

    /**
     * Builds SVG for multiple dots (up to 2)
     * @param hexColors Array of hex color codes
     * @returns SVG string
     */
    static buildMultiDotSvg(hexColors: string[]): string {
        // Positions for up to two dots
        const positions = hexColors.length === 1 ? [CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SINGLE] : [CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_FIRST, CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SECOND];
        const circles = hexColors.map((hex, i) => `<circle cx="${positions[i]}" cy="${CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_Y}" r="${CONSTANTS_NUMBER_SVG_CIRCLE_RADIUS}" fill="${hex}" stroke="${hex}" stroke-width="${CONSTANTS_NUMBER_SVG_CIRCLE_STROKE_WIDTH}"/>`).join('');
        return `<svg width="${CONSTANTS_NUMBER_SVG_WIDTH}" height="${CONSTANTS_NUMBER_SVG_HEIGHT}" viewBox="0 0 ${CONSTANTS_NUMBER_SVG_WIDTH} ${CONSTANTS_NUMBER_SVG_HEIGHT}" xmlns="${CONSTANTS_STRING_SVG_NAMESPACE}">${circles}</svg>`;
    }

    /**
     * Creates a composite decoration for multiple colors
     * @param colors Array of visualization colors (max 2)
     * @returns Text editor decoration type
     */
    static createCompositeDecoration(colors: VizColor[]): vscode.TextEditorDecorationType {
        // Normalize to max 2 colors, sorted key
        const norm = Array.from(new Set(colors)).slice(0, CONSTANTS_NUMBER_MAX_COLORS_COMPOSITE).sort();

        // Map colors to hex
        const colorHex: Record<VizColor, string> = {
            blue: CONSTANTS_COLOR_HEX_BLUE,
            red: CONSTANTS_COLOR_HEX_RED,
            orange: CONSTANTS_COLOR_HEX_ORANGE,
            green: CONSTANTS_COLOR_HEX_GREEN
        };

        const svg = this.buildMultiDotSvg(norm.map(c => colorHex[c]));
        const uri = vscode.Uri.parse(CONSTANTS_STRING_SVG_DATA_URI_PREFIX + Buffer.from(svg).toString('base64'));
        return vscode.window.createTextEditorDecorationType({ gutterIconPath: uri, gutterIconSize: 'contain' });
    }
}

