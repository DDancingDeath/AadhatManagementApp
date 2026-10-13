/**
 * @fileoverview Tests for ui/infinite-scroll.js with a mocked
 * IntersectionObserver: loads when the sentinel becomes visible, never runs
 * two loads at once, shows end/error/manual states, and stops auto-loading
 * when a load doesn't push the sentinel off screen.
 */

import { attachInfiniteScroll } from '../ui/infinite-scroll.js';

class MockIntersectionObserver {
    constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.targets = new Set();
        MockIntersectionObserver.instances.push(this);
    }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); }
    fire(isIntersecting) {
        this.callback([...this.targets].map(target => ({ target, isIntersecting })));
    }
}
MockIntersectionObserver.instances = [];

const flush = () => new Promise(r => setTimeout(r, 0));

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

let list;
const observer = () => MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
const sentinel = () => list.nextElementSibling;

beforeEach(() => {
    MockIntersectionObserver.instances = [];
    window.IntersectionObserver = MockIntersectionObserver;
    document.body.innerHTML = '<div id="wrap"><div id="list"></div><div id="after"></div></div>';
    list = document.getElementById('list');
});

afterEach(() => {
    delete window.IntersectionObserver;
});

test('adds one sentinel after the list and observes it', () => {
    attachInfiniteScroll(list, { loadMore: jest.fn() });
    attachInfiniteScroll(list, { loadMore: jest.fn() });
    expect(document.querySelectorAll('.infinite-scroll-sentinel')).toHaveLength(1);
    expect(sentinel().classList.contains('infinite-scroll-sentinel')).toBe(true);
    expect(MockIntersectionObserver.instances).toHaveLength(1);
    expect(observer().targets.has(sentinel())).toBe(true);
});

test('loads once while visible, shows a loading row, then re-renders', async () => {
    const d = deferred();
    const loadMore = jest.fn(() => d.promise);
    const onLoaded = jest.fn();
    attachInfiniteScroll(list, {
        loadMore, onLoaded, labels: { loading: 'Loading older bills…' }
    });

    observer().fire(true);
    observer().fire(true);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(sentinel().dataset.state).toBe('loading');
    expect(sentinel().textContent).toContain('Loading older bills…');

    d.resolve({ reachedEnd: false });
    await flush();
    expect(onLoaded).toHaveBeenCalledWith({ reachedEnd: false });
    expect(sentinel().dataset.state).toBe('idle');
});

test('shows the end row and stops observing when nothing older exists', async () => {
    const loadMore = jest.fn(async () => ({ reachedEnd: true }));
    attachInfiniteScroll(list, { loadMore, labels: { end: 'No older bills' } });

    observer().fire(true);
    await flush();
    expect(sentinel().dataset.state).toBe('end');
    expect(sentinel().textContent).toBe('No older bills');
    expect(observer().targets.size).toBe(0);
});

test('starts in the end state when isEnded is already true', () => {
    const loadMore = jest.fn();
    attachInfiniteScroll(list, { loadMore, isEnded: () => true, labels: { end: 'No older bills' } });
    expect(sentinel().textContent).toBe('No older bills');
    observer().fire(true);
    expect(loadMore).not.toHaveBeenCalled();
});

test('switches to a manual button when a load leaves the sentinel visible', async () => {
    const loadMore = jest.fn(async () => ({ reachedEnd: false }));
    attachInfiniteScroll(list, { loadMore, maxAutoLoads: 1, labels: { more: 'Load older bills' } });

    observer().fire(true);
    await flush();
    expect(loadMore).toHaveBeenCalledTimes(1);

    // Still visible after the re-render: don't keep auto-loading
    observer().fire(true);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(sentinel().dataset.state).toBe('manual');
    const btn = sentinel().querySelector('button');
    expect(btn.textContent).toBe('Load older bills');

    btn.click();
    await flush();
    expect(loadMore).toHaveBeenCalledTimes(2);
});

test('auto-loading resumes after the sentinel scrolls out of view', async () => {
    const loadMore = jest.fn(async () => ({ reachedEnd: false }));
    attachInfiniteScroll(list, { loadMore, maxAutoLoads: 1 });

    observer().fire(true);
    await flush();
    observer().fire(false);
    observer().fire(true);
    await flush();
    expect(loadMore).toHaveBeenCalledTimes(2);
});

test('disabled lists hide the sentinel and never load', () => {
    const loadMore = jest.fn();
    attachInfiniteScroll(list, { loadMore, enabled: () => false });
    expect(sentinel().style.display).toBe('none');
    observer().fire(true);
    expect(loadMore).not.toHaveBeenCalled();
});

test('a failed load shows a retry button', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const loadMore = jest.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ reachedEnd: true });
    attachInfiniteScroll(list, { loadMore });

    observer().fire(true);
    await flush();
    expect(sentinel().dataset.state).toBe('error');
    sentinel().querySelector('button').click();
    await flush();
    expect(loadMore).toHaveBeenCalledTimes(2);
    expect(sentinel().dataset.state).toBe('end');
});

test('without IntersectionObserver it offers a manual button', () => {
    delete window.IntersectionObserver;
    const loadMore = jest.fn(async () => ({ reachedEnd: false }));
    attachInfiniteScroll(list, { loadMore });
    expect(sentinel().dataset.state).toBe('manual');
    sentinel().querySelector('button').click();
    expect(loadMore).toHaveBeenCalledTimes(1);
});
