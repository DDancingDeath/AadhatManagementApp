#!/usr/bin/env node
/**
 * Exports every production Firestore collection (root collections not
 * starting with dev_) to one JSON file. Used by
 * .github/workflows/firestore-backup.yml; see tools/backup/README.md.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT  service-account JSON (needs Firestore read)
 *   BACKUP_TRIGGER            github.event_name ("schedule" enables the weekly rule)
 *   BACKUP_FORCE              "true" skips the size guard
 *   BACKUP_WEEKLY_ABOVE       docs above which scheduled runs go weekly (default 15000)
 *   BACKUP_HARD_MAX           docs above which nothing runs unless forced (default 40000)
 *   BACKUP_EXCLUDE            comma-separated collection ids to skip
 * Args:
 *   --out <file>              output JSON path (required)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { BACKUP_FORMAT, serialize, selectCollections, decideRun } = require('./backup-lib');

const PAGE_SIZE = 500;

function arg(name) {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : undefined;
}

function setOutput(key, value) {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function summary(markdown) {
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    console.log(markdown);
}

async function main() {
    const out = arg('--out');
    if (!out) throw new Error('--out <file> is required');
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    const serviceAccount = JSON.parse(raw);

    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore, FieldPath } = require('firebase-admin/firestore');
    initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
    const db = getFirestore();

    const all = (await db.listCollections()).map(c => c.id);
    const names = selectCollections(all, (process.env.BACKUP_EXCLUDE || '').split(','));

    // Aggregate counts cost ~1 read per 1000 docs, so the guard is cheap.
    const counts = {};
    for (const name of names) {
        counts[name] = (await db.collection(name).count().get()).data().count;
    }
    const totalDocs = Object.values(counts).reduce((a, b) => a + b, 0);

    const decision = decideRun({
        totalDocs,
        scheduled: process.env.BACKUP_TRIGGER === 'schedule',
        dayOfWeek: new Date().getUTCDay(),
        weeklyAbove: Number(process.env.BACKUP_WEEKLY_ABOVE) || 15000,
        hardMax: Number(process.env.BACKUP_HARD_MAX) || 40000,
        force: process.env.BACKUP_FORCE === 'true'
    });
    if (!decision.run) {
        summary(`### Firestore backup skipped\n${decision.reason}`);
        setOutput('skipped', 'true');
        if (decision.fail) process.exitCode = 1;
        return;
    }

    const backup = {
        format: BACKUP_FORMAT,
        exportedAt: new Date().toISOString(),
        env: 'prod',
        project: serviceAccount.project_id,
        collections: {}
    };
    for (const name of names) {
        const docs = [];
        let last = null;
        for (;;) {
            let q = db.collection(name).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
            if (last) q = q.startAfter(last);
            const snap = await q.get();
            snap.docs.forEach(d => docs.push({ id: d.id, data: serialize(d.data()) }));
            if (snap.size < PAGE_SIZE) break;
            last = snap.docs[snap.docs.length - 1];
        }
        backup.collections[name] = docs;
    }

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(backup));
    setOutput('skipped', 'false');
    setOutput('documents', String(totalDocs));
    const rows = names.map(n => `| ${n} | ${backup.collections[n].length} |`).join('\n');
    summary(`### Firestore backup\n${totalDocs} documents (≈${totalDocs} reads of the 50,000/day free quota)\n\n| Collection | Docs |\n|---|---|\n${rows}`);
}

main().catch(err => {
    // Never print the service account; only the error message.
    console.error(`Backup failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
});
