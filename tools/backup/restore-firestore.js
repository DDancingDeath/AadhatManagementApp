#!/usr/bin/env node
/**
 * Restores a decrypted backup JSON (from export-firestore.js or the in-app
 * Clear Data backup) into Firestore. See tools/backup/README.md.
 *
 * Safe by default:
 *  - dry run unless --apply is given (prints what would be written);
 *  - writes into dev_<collection> unless --target prod is given, which also
 *    needs --confirm-project <project id>;
 *  - never deletes; documents are written by their original id (overwriting
 *    a document with the same id, leaving all others alone).
 *
 * Usage:
 *   node tools/backup/restore-firestore.js --in backup.json [--collections items,purchases]
 *        [--apply] [--target dev|prod] [--confirm-project aadhat-management]
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT  service-account JSON with Firestore write access
 *     (or GOOGLE_APPLICATION_CREDENTIALS pointing at the key file)
 */
'use strict';

const fs = require('fs');
const { BACKUP_FORMAT, deserialize, targetCollection } = require('./backup-lib');

function arg(name) {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(name);

async function main() {
    const input = arg('--in');
    if (!input) throw new Error('--in <backup.json> is required');
    const backup = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (backup.format !== BACKUP_FORMAT) throw new Error(`Unknown backup format: ${backup.format}`);

    const target = arg('--target') === 'prod' ? 'prod' : 'dev';
    const only = (arg('--collections') || '').split(',').map(s => s.trim()).filter(Boolean);
    const names = Object.keys(backup.collections).filter(n => only.length === 0 || only.includes(n));
    const apply = flag('--apply');

    console.log(`Backup from ${backup.exportedAt} (${backup.env || 'prod'}), target: ${target}${apply ? '' : ' (dry run)'}`);
    names.forEach(n => console.log(`  ${n} -> ${targetCollection(n, target)}: ${backup.collections[n].length} docs`));
    if (!apply) {
        console.log('Dry run only. Add --apply to write.');
        return;
    }

    const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
    const { getFirestore, Timestamp, GeoPoint } = require('firebase-admin/firestore');
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const serviceAccount = raw ? JSON.parse(raw) : null;
    const app = initializeApp(serviceAccount
        ? { credential: cert(serviceAccount), projectId: serviceAccount.project_id }
        : { credential: applicationDefault() });
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const keyProject = keyFile && fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')).project_id : undefined;
    const projectId = app.options.projectId || keyProject || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) throw new Error('Could not tell which Firebase project the credentials are for');
    if (target === 'prod' && arg('--confirm-project') !== projectId) {
        throw new Error(`Restoring into PRODUCTION needs --confirm-project ${projectId}`);
    }

    const db = getFirestore();
    const types = { Timestamp, GeoPoint, doc: (p) => db.doc(p) };
    for (const name of names) {
        const col = db.collection(targetCollection(name, target));
        const docs = backup.collections[name];
        for (let i = 0; i < docs.length; i += 400) {
            const batch = db.batch();
            docs.slice(i, i + 400).forEach(d => batch.set(col.doc(d.id), deserialize(d.data, types)));
            await batch.commit();
        }
        console.log(`Restored ${docs.length} docs into ${col.id}`);
    }
}

main().catch(err => {
    console.error(`Restore failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
});
