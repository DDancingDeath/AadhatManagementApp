/**
 * @fileoverview #13 startup timing marks: first occurrence wins, rows carry
 * the time since page start and the step duration.
 */
import { markStartup, getStartupTimings, startupRows } from '../utils/startup-timings.js';

test('records each step once with its detail, in order', () => {
    const now = jest.spyOn(performance, 'now');
    now.mockReturnValueOnce(100).mockReturnValueOnce(250).mockReturnValueOnce(900);
    markStartup('templates');
    markStartup('auth', { signedIn: true });
    markStartup('auth', { signedIn: false });
    markStartup('app-shown');
    const { marks } = getStartupTimings();
    expect(marks.map(m => m.name)).toEqual(['templates', 'auth', 'app-shown']);
    expect(marks[1].detail).toEqual({ signedIn: true });
    expect(startupRows(marks)).toEqual([
        { name: 'templates', at: 100, delta: 100 },
        { name: 'auth', at: 250, delta: 150 },
        { name: 'app-shown', at: 900, delta: 650 }
    ]);
});
