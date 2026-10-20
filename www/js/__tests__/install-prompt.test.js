import { getInstallUiState, InstallManager } from '../services/install-prompt.js';

describe('getInstallUiState', () => {
    const base = { isNative: false, isStandalone: false, installed: false, hasPrompt: true };

    test('shows the button only when a prompt is available in a browser tab', () => {
        expect(getInstallUiState(base)).toBe('button');
        expect(getInstallUiState({ ...base, hasPrompt: false })).toBe('hint');
    });

    test('hides everything inside Capacitor, an installed window, or after install', () => {
        expect(getInstallUiState({ ...base, isNative: true })).toBe('hidden');
        expect(getInstallUiState({ ...base, isNative: true, hasPrompt: false })).toBe('hidden');
        expect(getInstallUiState({ ...base, isStandalone: true })).toBe('hidden');
        expect(getInstallUiState({ ...base, installed: true })).toBe('hidden');
    });
});

describe('InstallManager', () => {
    function setup({ standalone = false, capacitor } = {}) {
        document.body.innerHTML = `
            <div id="installAppCard" style="display:none">
                <button id="installAppBtn" style="display:none"></button>
                <p id="installAppHint" style="display:none"></p>
            </div>`;
        window.matchMedia = (q) => ({ matches: standalone && q === '(display-mode: standalone)' });
        window.Capacitor = capacitor;
        window.__installPromptEvent = undefined;
        Object.assign(InstallManager, { deferredPrompt: null, installed: false });
        InstallManager.init(window);
        const $ = (id) => document.getElementById(id).style.display;
        return { card: () => $('installAppCard'), btn: () => $('installAppBtn'), hint: () => $('installAppHint') };
    }

    afterEach(() => { delete window.Capacitor; });

    test('beforeinstallprompt reveals the button; appinstalled hides the card', () => {
        const ui = setup();
        expect([ui.card(), ui.btn(), ui.hint()]).toEqual(['', 'none', '']);

        window.dispatchEvent(new Event('beforeinstallprompt'));
        expect([ui.card(), ui.btn(), ui.hint()]).toEqual(['', '', 'none']);

        window.dispatchEvent(new Event('appinstalled'));
        expect(ui.card()).toBe('none');
    });

    test('stays hidden in the Capacitor app and in standalone mode', () => {
        expect(setup({ capacitor: { isNativePlatform: () => true } }).card()).toBe('none');
        expect(setup({ standalone: true }).card()).toBe('none');
    });

    test('prompt() uses the deferred event once and hides on acceptance', async () => {
        const ui = setup();
        const evt = new Event('beforeinstallprompt');
        evt.prompt = jest.fn().mockResolvedValue(undefined);
        evt.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(evt);

        await InstallManager.prompt();
        expect(evt.prompt).toHaveBeenCalledTimes(1);
        expect(InstallManager.deferredPrompt).toBeNull();
        expect(ui.card()).toBe('none');
    });
});
