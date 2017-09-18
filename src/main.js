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

let fwrite = {
    _lines: [],
    out: function(line) { this._lines.push(line); },
    save: function(fname) { fs.writeFileSync(fname, this._lines.join('\n')); this._lines = []; },
    print: function() { console.log(this._lines.join('\n')); }
};

let pkg = require(path.resolve(process.cwd(), './package.json'));

let config = Object.assign({
    deploy: './deploy.yaml',
    docker: './Dockerfile',
    source: './src/;./lib/;./config/',
    proto: './proto/',
    output: './README.md'
}, pkg['grpc-docs'] || {});

let git = (require('./gitdoc'))();
let deploy = (require('./deploydoc'))(config.deploy);
let docker = (require('./dockerdoc'))(config.docker);
let jsdoc = (require('./jsdoc'))(config.source);
let protos = (require('./protodoc'))(config.proto);

let fullname = git.name;
if (pkg.name && git.name.toLowerCase() !== pkg.name.toLowerCase())
    fullname += ` (${pkg.name})`;
fwrite.out(`\n# ${fullname}`);

git.writeSummary(fwrite);

git.writeContacts(fwrite);

deploy.writeEnvironments(fwrite);

jsdoc.writeEnvironment(fwrite, [deploy.getEnvSettings(), docker.env]);

jsdoc.writeUrlRefs(fwrite);

docker.writeDevInfo(fwrite);

jsdoc.writeExampleDocs(fwrite);

protos.writeApiDocs(fwrite);

jsdoc.writeHierarchy(fwrite);

jsdoc.writeSourceDocs(fwrite);

fwrite.out('\n-----------------------');
fwrite.save(config.output);
//fwrite.print();
