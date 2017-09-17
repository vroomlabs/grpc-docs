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

const fs = require('fs');
const path = require('path');

module.exports = function (dockerfile) {
    dockerfile = dockerfile || path.join(process.cwd(), 'Dockerfile');
    let lines = fs.readFileSync(dockerfile).toString().split('\n');

    let env = {};
    let run = [];
    let cmd = [];

    lines.map(l => l.match(/^ENV (\w+)(\s.*)?$/i))
        .filter(l => l)
        .forEach(m => {
            let val = m[2];
            if (val) {
                val = val.replace(/^[\s=]+/, '');
                val = val.match(/^'.*'$/) ? val.substr(1, val.length - 2) : val;
            }
            env[m[1].toUpperCase()] = val;
        });

    lines.map(l => l.match(/^RUN (.*)$/i))
        .filter(l => l)
        .map(m => (m[1].match(/install/)) ? m[1].replace(/\s*--production\s*/, ' ') : m[1])
        .forEach(m => run.push(m));

    lines.map(l => l.match(/^CMD (.*)$/i))
        .filter(l => l)
        .forEach(m => cmd.push(m[1]));

    return {
        env: env,
        run: run,
        cmd: cmd,

        writeDevInfo: function (fwrite) {

            let pkg = require(path.join(process.cwd(), 'package.json'));
            if (this.run.length === 0) this.run.push('npm install --progress=false');
            if (this.cmd.length === 0) this.cmd.push('npm start');

            fwrite.out('\n-----------------------');
            fwrite.out('\n##Development Information');

            this.run.forEach(cmd => fwrite.out('    ' + cmd));
            if (pkg.scripts && pkg.scripts.babel)
                fwrite.out('    npm run babel');
            this.cmd.forEach(cmd => fwrite.out('    ' + cmd));

            if (pkg.scripts && pkg.scripts.esp) {
                fwrite.out('\nYou **must have** a json google cloud key with access to the dev endpoint stored in the following path:');
                fwrite.out('\n    ./keys/serviceaccount.json\n');

                fwrite.out('\nIn another terminal session run:');
                fwrite.out('\n    npm run esp');
                fwrite.out('\nView the service via [127.0.0.1:8000](http://127.0.0.1:8000)');
            }

            if (pkg.main)
                fwrite.out(`\n**Entry Point**: \`${pkg.main || 'unspecified'}\``);

            if (pkg.scripts && Object.keys(pkg.scripts).length) {
                fwrite.out('\n###npm run scripts:');
                Object.keys(pkg.scripts || {})
                    .forEach(k => fwrite.out(`\`${k}\``));
                //    .forEach(k => fwrite.out(`\n**${k}** \n\n    ${pkg.scripts[k]}`));
            }

            if (pkg.dependencies && Object.keys(pkg.dependencies).length) {
                fwrite.out('\n###npm dependencies:');
                Object.keys(pkg.dependencies || {})
                    .forEach(k => fwrite.out(`\`${k}\``));
            }

            if (pkg.devDependencies && Object.keys(pkg.devDependencies).length) {
                fwrite.out('\n###npm dev-dependencies:');
                Object.keys(pkg.devDependencies || {})
                    .forEach(k => fwrite.out(`\`${k}\``));
            }
        }
    }
};
