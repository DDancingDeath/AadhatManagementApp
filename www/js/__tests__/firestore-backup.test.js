/**
 * @jest-environment node
 */
/**
 * Firestore backup helpers (tools/backup/backup-lib.js): serialisation
 * round-trip, prod-only collection selection, free-quota guard, restore target.
 */
const { serialize, deserialize, selectCollections, decideRun, targetCollection } = require('../../../tools/backup/backup-lib.js');

class FakeTimestamp {
    constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
    toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
    static fromMillis(ms) { return new FakeTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
}
class FakeGeoPoint {
    constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
}
const types = { Timestamp: FakeTimestamp, GeoPoint: FakeGeoPoint, doc: (path) => ({ path, firestore: {} }) };

describe('backup serialisation', () => {
    test('Timestamps, refs, geopoints and bytes survive a JSON round-trip', () => {
        const data = {
            createdAt: new FakeTimestamp(1700000000, 123456789),
            items: [{ name: 'Chana', qty: 10 }],
            ref: { path: 'items/a', firestore: {} },
            where: new FakeGeoPoint(26.9, 75.8),
            blob: Buffer.from('hi'),
            nested: { when: new FakeTimestamp(1, 0), none: null }
        };
        const json = JSON.parse(JSON.stringify(serialize(data)));
        expect(json.createdAt).toEqual({ __type: 'timestamp', iso: '2023-11-14T22:13:20.123Z', millis: 1700000000123, seconds: 1700000000, nanoseconds: 123456789 });
        const back = deserialize(json, types);
        expect(back.createdAt).toEqual(new FakeTimestamp(1700000000, 123456789));
        expect(back.items).toEqual([{ name: 'Chana', qty: 10 }]);
        expect(back.ref.path).toBe('items/a');
        expect(back.where).toEqual(new FakeGeoPoint(26.9, 75.8));
        expect(back.blob.toString()).toBe('hi');
        expect(back.nested.when.seconds).toBe(1);
    });

    test('in-app backups (millis only) restore via fromMillis', () => {
        const back = deserialize({ t: { __type: 'timestamp', iso: 'x', millis: 1500 } }, types);
        expect(back.t).toEqual(new FakeTimestamp(1, 500000000));
    });
});

describe('collection selection and restore target', () => {
    test('dev_ collections and excluded ones are skipped', () => {
        expect(selectCollections(['purchases', 'dev_purchases', 'items', 'notifications', 'users'], ['notifications', ' ']))
            .toEqual(['items', 'purchases', 'users']);
    });
    test('restores default to dev_ copies', () => {
        expect(targetCollection('items', 'dev')).toBe('dev_items');
        expect(targetCollection('dev_items', 'dev')).toBe('dev_items');
        expect(targetCollection('items', 'prod')).toBe('items');
    });
});

describe('free-quota guard', () => {
    const base = { weeklyAbove: 15000, hardMax: 40000, force: false };
    test('small database: runs every night', () => {
        expect(decideRun({ ...base, totalDocs: 9000, scheduled: true, dayOfWeek: 3 }).run).toBe(true);
    });
    test('medium database: scheduled runs only on Sunday, manual runs always', () => {
        expect(decideRun({ ...base, totalDocs: 20000, scheduled: true, dayOfWeek: 3 })).toMatchObject({ run: false, fail: false });
        expect(decideRun({ ...base, totalDocs: 20000, scheduled: true, dayOfWeek: 0 }).run).toBe(true);
        expect(decideRun({ ...base, totalDocs: 20000, scheduled: false, dayOfWeek: 3 }).run).toBe(true);
    });
    test('too large: fails unless forced', () => {
        expect(decideRun({ ...base, totalDocs: 45000, scheduled: false, dayOfWeek: 0 })).toMatchObject({ run: false, fail: true });
        expect(decideRun({ ...base, totalDocs: 45000, scheduled: false, dayOfWeek: 0, force: true }).run).toBe(true);
    });
});
