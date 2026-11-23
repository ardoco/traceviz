// Bootstraps VS Code for the Web for the TraceViz demo.
// Based on the workbench bootstrap of @vscode/test-web (MIT License, Copyright (c) Microsoft Corporation).
import { create, URI } from './vscode/out/vs/workbench/workbench.web.main.internal.js';

const siteRoot = new URL('.', import.meta.url);

/**
 * URI components of a static extension folder below the site root.
 * @param {string} relativePath
 */
function extensionLocation(relativePath) {
	const url = new URL(relativePath, siteRoot);
	return { scheme: url.protocol.slice(0, -1), authority: url.host, path: url.pathname.replace(/\/$/, '') };
}

const folderUri = URI.from({ scheme: 'tracevizdemo', path: '/mediastore' });

create(document.body, {
	productConfiguration: {
		nameShort: 'TraceViz Demo',
		nameLong: 'TraceViz Demo (VS Code for the Web)',
		enableTelemetry: false,
		// Start the extension host in a same-origin iframe served from this site instead of
		// https://{{uuid}}.vscode-cdn.net (GitHub Pages cannot serve per-session subdomains)
		webEndpointUrlTemplate: '',
		// The demo has no marketplace and no chat: drop the product.json entries that make the workbench fetch
		// https://main.vscode-cdn.net/extensions/marketplace.json (extensionsGallery.controlUrl) and
		// https://main.vscode-cdn.net/extensions/chat.json (chatParticipantRegistry). Both requests are
		// cross-origin and fail with CORS errors on other hosts than vscode.dev.
		extensionsGallery: undefined,
		chatParticipantRegistry: undefined,
		// Quick Open (Ctrl+P) in the demo workspace
		extensionEnabledApiProposals: { 'ardoco.traceviz-demo-workspace': ['fileSearchProvider'] }
	},
	additionalBuiltinExtensions: [
		extensionLocation('extensions/demo-workspace/'),
		extensionLocation('extensions/traceviz/')
	],
	configurationDefaults: {
		'workbench.startupEditor': 'none',
		'workbench.tips.enabled': false,
		'workbench.enableExperiments': false,
		'security.workspace.trust.enabled': false,
		'extensions.ignoreRecommendations': true,
		'chat.disableAIFeatures': true,
		// Show hovers below the line in the documentation, so the trace link hover does not cover the CodeLens above it
		'[plaintext]': { 'editor.hover.above': false }
	},
	workspaceProvider: {
		workspace: { folderUri },
		trusted: true,
		payload: Object.create(null),
		open: async () => false
	}
});
