// Serves demo/dist under a sub-path to mimic GitHub Pages (https://ardoco.de/traceviz/).
// Usage: npm run demo:serve [-- --port 8080 --base /traceviz/]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const port = Number(option('--port', '8080'));
const base = option('--base', '/traceviz/');
const root = join(dirname(fileURLToPath(import.meta.url)), 'dist');

const types = {
	'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
	'.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
	'.wasm': 'application/wasm', '.txt': 'text/plain', '.md': 'text/markdown', '.webp': 'image/webp',
};

createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost');
	if (!url.pathname.startsWith(base)) {
		response.writeHead(302, { location: base }).end();
		return;
	}
	let relative;
	try {
		relative = decodeURIComponent(url.pathname.substring(base.length));
	} catch {
		response.writeHead(400).end('Bad request');
		return;
	}
	let file = normalize(join(root, relative));
	if (file !== root && !file.startsWith(root + sep)) {
		response.writeHead(403).end();
		return;
	}
	if (existsSync(file) && statSync(file).isDirectory()) {
		file = join(file, 'index.html');
	}
	if (!existsSync(file)) {
		response.writeHead(404).end('Not found');
		return;
	}
	response.writeHead(200, { 'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream' });
	createReadStream(file).pipe(response);
}).listen(port, () => console.log(`TraceViz demo: http://localhost:${port}${base}`));
