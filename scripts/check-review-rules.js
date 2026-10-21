#!/usr/bin/env node
/**
 * Checks code against the regex registry in .github/review-rules.yml (#54).
 *
 *   node scripts/check-review-rules.js              # lines added vs merge-base with origin/main (incl. uncommitted)
 *   node scripts/check-review-rules.js --base <ref> # compare against another ref (CI: origin/<base branch>)
 *   node scripts/check-review-rules.js --all        # scan every tracked file (report existing violations)
 *
 * Exit code 1 when any `severity: block` rule matches (in --all mode only with --strict).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RULES_PATH = path.join(ROOT, '.github', 'review-rules.yml');

function parseScalar(raw) {
    const v = raw.trim();
    if (v === '' || v === 'null' || v === '~') return null;
    if (v.startsWith('"') || v.startsWith('[')) return JSON.parse(v);
    if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
    return v;
}

/** Parses the YAML subset used by review-rules.yml (see the header of that file). */
function parseRules(text) {
    const lines = text.split(/\r?\n/);
    const rules = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(#.*)?$/.test(line) || /^rules:\s*$/.test(line)) continue;
        const m = /^(\s*)(- )?([A-Za-z_]+):\s?(.*)$/.exec(line);
        if (!m) throw new Error(`review-rules.yml line ${i + 1}: cannot parse: ${line}`);
        const [, indent, dash, key, rest] = m;
        if (dash) {
            current = {};
            rules.push(current);
        } else if (!current) {
            throw new Error(`review-rules.yml line ${i + 1}: key outside a rule`);
        }
        if (rest.trim() === '|') {
            const keyIndent = indent.length + (dash ? 2 : 0);
            const block = [];
            while (i + 1 < lines.length) {
                const next = lines[i + 1];
                const nextIndent = next.length - next.trimStart().length;
                if (next.trim() !== '' && nextIndent <= keyIndent) break;
                block.push(next.trim());
                i++;
            }
            current[key] = block.join('\n').trim();
        } else {
            current[key] = parseScalar(rest);
        }
    }
    for (const r of rules) {
        if (!r.id || !r.severity) throw new Error(`review rule missing id/severity: ${JSON.stringify(r)}`);
        if (!['block', 'warn', 'info'].includes(r.severity)) throw new Error(`rule ${r.id}: bad severity ${r.severity}`);
        r.applies_to = [].concat(r.applies_to || []);
        r.excludes = [].concat(r.excludes || []);
        r.regex = r.pattern == null ? null : new RegExp(r.pattern);
    }
    return rules;
}

function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*') {
            if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
        } else if (c === '*') re += '[^/]*';
        else if (c === '?') re += '[^/]';
        else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${re}$`);
}

// Test files hold deliberate bad samples (e.g. review-rules.test.js), so they are never checked.
const ALWAYS_EXCLUDED = /(^|\/)__tests__\//;

function ruleAppliesTo(rule, file) {
    const f = file.split(path.sep).join('/');
    if (ALWAYS_EXCLUDED.test(f)) return false;
    return rule.applies_to.some((g) => globToRegExp(g).test(f))
        && !rule.excludes.some((g) => globToRegExp(g).test(f));
}

/** @param {{file:string, line:number, text:string}[]} lines */
function findViolations(rules, lines) {
    const out = [];
    for (const l of lines) {
        for (const r of rules) {
            if (r.regex && ruleAppliesTo(r, l.file) && r.regex.test(l.text)) {
                out.push({ ...l, rule: r });
            }
        }
    }
    return out;
}

/** Added lines from `git diff -U0` output. */
function parseAddedLines(diff) {
    const out = [];
    let file = null;
    let lineNo = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++ ')) {
            file = line === '+++ /dev/null' ? null : line.slice(4).replace(/^b\//, '');
        } else if (line.startsWith('@@')) {
            const m = /\+(\d+)/.exec(line);
            lineNo = m ? Number(m[1]) : 0;
        } else if (file && line.startsWith('+')) {
            out.push({ file, line: lineNo++, text: line.slice(1).replace(/\r$/, '') });
        }
    }
    return out;
}

function git(args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function changedLines(base) {
    const mergeBase = git(['merge-base', base, 'HEAD']).trim();
    const diff = git(['diff', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR', mergeBase, '--']);
    const lines = parseAddedLines(diff);
    for (const f of git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
        fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/)
            .forEach((text, i) => lines.push({ file: f, line: i + 1, text }));
    }
    return lines;
}

function allLines(rules) {
    const lines = [];
    for (const f of git(['ls-files']).split('\n').filter(Boolean)) {
        if (!rules.some((r) => ruleAppliesTo(r, f))) continue;
        const full = path.join(ROOT, f);
        if (!fs.existsSync(full)) continue;
        fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((text, i) => lines.push({ file: f, line: i + 1, text }));
    }
    return lines;
}

function main(argv) {
    const all = argv.includes('--all');
    const strict = argv.includes('--strict');
    const bi = argv.indexOf('--base');
    const base = bi >= 0 ? argv[bi + 1] : (process.env.REVIEW_BASE || 'origin/main');
    const rules = parseRules(fs.readFileSync(RULES_PATH, 'utf8'));
    const violations = findViolations(rules, all ? allLines(rules) : changedLines(base));
    const order = { block: 0, warn: 1, info: 2 };
    violations.sort((a, b) => order[a.rule.severity] - order[b.rule.severity] || a.file.localeCompare(b.file) || a.line - b.line);
    for (const v of violations) {
        const summary = v.rule.message ? v.rule.message.split('\n')[0] : '';
        console.log(`${v.file}:${v.line} [${v.rule.severity}] ${v.rule.id} — ${summary}\n    ${v.text.trim().slice(0, 160)}`);
    }
    const blocks = violations.filter((v) => v.rule.severity === 'block').length;
    console.log(`\nreview rules: ${rules.length} rules, ${violations.length} finding(s), ${blocks} blocking (${all ? 'all files' : `added lines vs ${base}`})`);
    if (blocks && (!all || strict)) {
        console.log('Fix the blocking findings (see .github/review-rules.yml for the reasoning).');
        return 1;
    }
    return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { parseRules, globToRegExp, ruleAppliesTo, findViolations, parseAddedLines, RULES_PATH };
