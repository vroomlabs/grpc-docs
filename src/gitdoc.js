"use strict";
/******************************************************************************
 * MIT License
 * Copyright (c) 2017 https://github.com/vroomlabs
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Created by ... I don't want my name on it :/
 * #WorstCodeEver, but hey, it's gets the monkey off my back.
 ******************************************************************************/
const path = require('path');
const child_process = require('child_process');

module.exports = function () {
    let authors = {};
    child_process.execSync('git log -n 50')
        .toString().split('\n')
        .filter(line => line.match(/^Author: /))
        .map(line => line.substr(8))
        .forEach(author => authors[author] = 0);

    let remote = child_process.execSync('git remote -v').toString().split('\n');

    let repo = remote.map(l => (l.match(/git@[\w-:./]+\.git/) || [])[0]).filter(l => l)[0]
        || remote.map(l => (l.match(/https:\/\/[\w-:./]+\.git/) || [])[0]).filter(l => l)[0];

    let name = repo.match(/\/([^/]*)\.git$/)[1];

    return {
        name: name,
        repo: repo,
        authors: Object.keys(authors).sort(),

        writeSummary: function (fwrite) {
            let pkg = require(path.resolve(process.cwd(), './package.json'));
            fwrite.out('\n-----------------------');
            fwrite.out('\n##Summary');
            fwrite.out('\n' + pkg.description);
            fwrite.out(`\n**Repository**: [${this.repo}](${this.repo.match(/^http/)?'':'ssh://'}${this.repo})`);
            fwrite.out('\n`git clone ' + this.repo + '`');

            fwrite.out('\n###links:');
            fwrite.out(`* [Repository](https://bitbucket.org/tdalabs/${this.name})`);
            if (pkg.bugs) fwrite.out('* [Issue Tracking](' + pkg.bugs + ')');
            if (pkg.homepage) fwrite.out('* [Documentation](' + pkg.homepage + ')');
        },

        writeContacts: function (fwrite) {
            fwrite.out('\n-----------------------');
            fwrite.out(`\n##Contact Information\n`);
            Object.keys(authors).forEach(a => fwrite.out('* ' + a));
            fwrite.out('');
        }
    };
};
