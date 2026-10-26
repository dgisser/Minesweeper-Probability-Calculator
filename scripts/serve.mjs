import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const port = Number.parseInt(process.env.PORT ?? '8000', 10);

const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.png', 'image/png'],
]);

function resolveRequestPath(requestUrl) {
    const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = normalize(join(repositoryRoot, requestedPath));
    const pathFromRoot = relative(repositoryRoot, filePath);

    if (pathFromRoot.startsWith('..') || pathFromRoot === '') {
        return null;
    }

    return filePath;
}

const server = createServer(async (request, response) => {
    const filePath = resolveRequestPath(request.url ?? '/');

    if (filePath === null) {
        response.writeHead(403).end('Forbidden');
        return;
    }

    try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) {
            throw new Error('Not a file');
        }

        response.writeHead(200, {
            'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
            'Content-Length': fileStat.size,
        });
        createReadStream(filePath).pipe(response);
    } catch {
        response.writeHead(404).end('Not found');
    }
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Minesweeper is available at http://localhost:${port}`);
});
