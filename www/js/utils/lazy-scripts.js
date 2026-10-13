// On-demand loader for large third-party libraries that are only needed by
// specific features, so they don't block or slow down the first page load.

export const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
export const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js';

const pending = new Map();

export function loadScriptOnce(src, globalName) {
    if (globalName && typeof window !== 'undefined' && window[globalName]) {
        return Promise.resolve(window[globalName]);
    }
    if (pending.has(src)) return pending.get(src);

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
            if (globalName && !window[globalName]) {
                reject(new Error(`${src} loaded but window.${globalName} is missing`));
                return;
            }
            resolve(globalName ? window[globalName] : undefined);
        };
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });

    // Allow a retry after a failure (e.g. the user was offline).
    promise.catch(() => pending.delete(src));
    pending.set(src, promise);
    return promise;
}

export function ensureXLSX() {
    return loadScriptOnce(XLSX_URL, 'XLSX');
}

export function ensureChart() {
    return loadScriptOnce(CHART_URL, 'Chart');
}
