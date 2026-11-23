import * as vscode from 'vscode';
import { VizColor } from '../types';
import { CONSTANTS_NUMBER_MAX_COLORS_COMPOSITE } from '../constants';
import { COLOR_HEX, dotIconUri, dotsSvg, hollowDotIconUri, themeColor, UNLINKED_THEME_COLOR_ID } from '../visualization/palette';

/**
 * Service for creating text editor decorations (colors come from the palette module)
 */
export class DecorationService {
    /**
     * Creates a gutter dot decoration with the specified color
     * @param color Set color
     * @returns Text editor decoration type
     */
    static createGutterDot(color: VizColor): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({ gutterIconPath: dotIconUri(color), gutterIconSize: 'contain' });
    }

    /**
     * Builds SVG for multiple dots (up to 2)
     * @param colors Set colors
     * @returns SVG string
     */
    static buildMultiDotSvg(colors: VizColor[]): string {
        return dotsSvg(colors);
    }

    /**
     * Creates a URI for a single coloured circle icon (for use as a TreeItem or Quick Pick iconPath).
     * Because the colour is embedded in the SVG it is not overridden by VS Code's
     * list-selection foreground, unlike a ThemeIcon with ThemeColor.
     * @param color Set color
     * @returns URI pointing to an inline SVG data-URI
     */
    static createCircleIconUri(color: VizColor): vscode.Uri {
        return dotIconUri(color);
    }

    /**
     * Creates a composite decoration for multiple colors
     * @param colors Array of visualization colors (max 2)
     * @returns Text editor decoration type
     */
    static createCompositeDecoration(colors: VizColor[]): vscode.TextEditorDecorationType {
        // Normalize to max 2 colors, sorted key
        const norm = Array.from(new Set(colors)).filter(c => c in COLOR_HEX).slice(0, CONSTANTS_NUMBER_MAX_COLORS_COMPOSITE).sort();
        return vscode.window.createTextEditorDecorationType({ gutterIconPath: dotIconUri(norm), gutterIconSize: 'contain' });
    }

    /**
     * Creates an overview ruler (scroll bar) mark in the color of a set
     * @param color Set color
     * @param lane Overview ruler lane of the set
     * @returns Text editor decoration type
     */
    static createOverviewRulerMark(color: VizColor, lane: vscode.OverviewRulerLane): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({ overviewRulerColor: themeColor(color), overviewRulerLane: lane });
    }

    /**
     * Creates the subtle marker of documentation lines that no active set links:
     * a hollow gray ring in the gutter and a gray mark in the overview ruler
     * @returns Text editor decoration type
     */
    static createUnlinkedLineDecoration(): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            gutterIconPath: hollowDotIconUri(),
            gutterIconSize: 'contain',
            overviewRulerColor: new vscode.ThemeColor(UNLINKED_THEME_COLOR_ID),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
    }
}
