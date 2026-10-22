// Updated by `npm run release` (scripts/release.js); must match www/changelog.json.
export const APP_VERSION = '1.5.1';
export const ANDROID_VERSION_CODE = 7;

if (typeof window !== 'undefined') {
    window.AADHAT_VERSION = { APP_VERSION, ANDROID_VERSION_CODE };
}
