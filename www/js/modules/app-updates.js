/**
 * @fileoverview "What's new" sheet, Android soft-update banner and app sharing.
 * Everything here is best-effort: failures are logged and never block the app.
 * @module modules/app-updates
 */

import { APP_VERSION } from '../version.js';
import { UIManager } from '../ui/ui-manager.js';
import {
    APK_DOWNLOAD_URL, DOWNLOAD_PAGE_URL, LATEST_RELEASE_API,
    buildShareMessage, findRelease, shouldCheckForUpdate, updateToOffer,
    whatsAppShareUrl, whatsNewToShow
} from '../utils/release-info.js';

const KEYS = {
    lastSeen: 'aadhat.lastSeenVersion',
    lastCheck: 'aadhat.updateLastCheck',
    latestTag: 'aadhat.updateLatestTag',
    dismissed: 'aadhat.updateDismissedVersion'
};

const store = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) { /* storage full/blocked */ } }
};

function isNative() {
    return Boolean(window.Capacitor?.isNativePlatform?.());
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

let changelogPromise = null;

export class AppUpdatesManager {
    static get appVersion() {
        return APP_VERSION;
    }

    /** Fetches changelog.json (bypassing the HTTP cache; the SW serves it network-first). */
    static loadChangelog() {
        if (!changelogPromise) {
            changelogPromise = fetch('changelog.json', { cache: 'no-cache' })
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null)
                .then((data) => {
                    if (!data) changelogPromise = null;
                    return data;
                });
        }
        return changelogPromise;
    }

    /** Called once the main UI is visible. Non-blocking. */
    static onAppReady() {
        setTimeout(() => {
            this.maybeShowWhatsNew().catch((e) => console.warn('[updates] whats-new failed:', e));
            this.checkForAndroidUpdate().catch((e) => console.warn('[updates] update check failed:', e));
        }, 800);
    }

    static async maybeShowWhatsNew() {
        const changelog = await this.loadChangelog();
        const release = whatsNewToShow(changelog, APP_VERSION, store.get(KEYS.lastSeen));
        if (release) this.renderWhatsNew(release);
    }

    /** Settings → "What's new": reopen the notes for the running version. */
    static async showWhatsNew() {
        const changelog = await this.loadChangelog();
        const release = findRelease(changelog, APP_VERSION) || changelog?.releases?.[0];
        if (!release) {
            UIManager.showToast('Could not load release notes / जानकारी लोड नहीं हुई');
            return;
        }
        this.renderWhatsNew(release);
    }

    static renderWhatsNew(release) {
        document.getElementById('whatsNewSheet')?.remove();
        const backdrop = el('div', 'app-sheet-backdrop');
        backdrop.id = 'whatsNewSheet';
        const sheet = el('div', 'app-sheet');
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', 'whatsNewTitle');

        const title = el('h3', 'app-sheet-title', `क्या नया है / What's new — v${release.version}`);
        title.id = 'whatsNewTitle';
        sheet.appendChild(title);

        const sections = [['hi', 'हिंदी'], ['en', 'English']];
        for (const [lang, label] of sections) {
            const notes = Array.isArray(release.notes?.[lang]) ? release.notes[lang] : [];
            if (!notes.length) continue;
            sheet.appendChild(el('div', 'app-sheet-lang', label));
            const list = el('ul', 'app-sheet-notes');
            notes.forEach((note) => list.appendChild(el('li', '', String(note))));
            if (lang === 'hi') list.lang = 'hi';
            sheet.appendChild(list);
        }

        const close = el('button', 'add-item-btn app-sheet-close', 'ठीक है / OK');
        close.type = 'button';
        const dismiss = () => {
            store.set(KEYS.lastSeen, APP_VERSION);
            backdrop.remove();
        };
        close.addEventListener('click', dismiss);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss(); });
        sheet.appendChild(close);

        backdrop.appendChild(sheet);
        document.body.appendChild(backdrop);
        close.focus();
    }

    /** Android only: offer a newer APK published on GitHub Releases. */
    static async checkForAndroidUpdate(now = Date.now()) {
        if (!isNative()) return;
        let latestTag = store.get(KEYS.latestTag);
        if (shouldCheckForUpdate(store.get(KEYS.lastCheck), now)) {
            try {
                const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
                if (res.ok) {
                    const data = await res.json();
                    if (typeof data?.tag_name === 'string') {
                        latestTag = data.tag_name;
                        store.set(KEYS.latestTag, latestTag);
                    }
                }
                store.set(KEYS.lastCheck, now);
            } catch (_) {
                // Offline / rate limited: try again next start.
            }
        }
        const version = updateToOffer(APP_VERSION, latestTag, store.get(KEYS.dismissed));
        if (version) this.renderUpdateBanner(version);
    }

    static renderUpdateBanner(version) {
        document.getElementById('appUpdateBanner')?.remove();
        const banner = el('div', 'app-update-banner');
        banner.id = 'appUpdateBanner';
        banner.setAttribute('role', 'status');

        const text = el('div', 'app-update-text');
        text.appendChild(el('strong', '', `नया वर्ज़न v${version} उपलब्ध है`));
        text.appendChild(el('span', '', `Update available: v${version}`));
        banner.appendChild(text);

        const actions = el('div', 'app-update-actions');
        const download = el('button', 'app-update-download', 'डाउनलोड / Download');
        download.type = 'button';
        download.addEventListener('click', () => this.openExternal(APK_DOWNLOAD_URL));
        const howTo = el('a', 'app-update-howto', 'कैसे इंस्टॉल करें? / How to install');
        howTo.href = DOWNLOAD_PAGE_URL;
        howTo.addEventListener('click', (e) => { e.preventDefault(); this.openExternal(DOWNLOAD_PAGE_URL); });
        const close = el('button', 'app-update-close', '✕');
        close.type = 'button';
        close.setAttribute('aria-label', 'Dismiss / बंद करें');
        close.addEventListener('click', () => {
            store.set(KEYS.dismissed, version);
            banner.remove();
        });
        actions.append(download, howTo, close);
        banner.appendChild(actions);
        document.body.appendChild(banner);
    }

    /** Opens a URL outside the app (system browser / WhatsApp on Android). */
    static openExternal(url) {
        if (isNative()) {
            // Capacitor hands navigations to non-allowed hosts to the system (browser/WhatsApp).
            window.open(url, '_system');
            return;
        }
        const win = window.open(url, '_blank', 'noopener');
        if (!win) window.location.href = url;
    }

    static async getShareMessage() {
        const changelog = await this.loadChangelog();
        const release = findRelease(changelog, APP_VERSION) || changelog?.releases?.[0] || { version: APP_VERSION };
        return buildShareMessage(release, DOWNLOAD_PAGE_URL);
    }

    static async shareOnWhatsApp() {
        this.openExternal(whatsAppShareUrl(await this.getShareMessage()));
    }

    static canNativeShare() {
        return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    }

    static async shareNative() {
        if (!this.canNativeShare()) {
            await this.shareOnWhatsApp();
            return;
        }
        try {
            await navigator.share({ title: 'Aadhat Management', text: await this.getShareMessage() });
        } catch (e) {
            if (e?.name !== 'AbortError') UIManager.showToast('Share failed / शेयर नहीं हो पाया');
        }
    }

    static openDownloadPage() {
        this.openExternal(DOWNLOAD_PAGE_URL);
    }

    /** Fills the version text and hides unsupported buttons in Settings. */
    static renderSettings() {
        const versionText = document.getElementById('appVersionText');
        if (versionText) versionText.textContent = APP_VERSION;
        const nativeShareBtn = document.getElementById('shareAppNativeBtn');
        if (nativeShareBtn) nativeShareBtn.style.display = this.canNativeShare() ? '' : 'none';
    }
}
