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
const jsdocapi = require('jsdoc-api');
const precinct = require('precinct').paperwork;
const expandFiles = require('./utils').expandFiles;

let pkg = require(path.join(process.cwd(), 'package.json'));
let pthStartOffset = path.resolve(process.cwd()).replace(/\/$/,'').length + 1;

function renderDep(fwrite, basePath, srcMap, depth, fname, recurse) {
    let prefix = '';
    for (let ix = 0; ix < depth; ix++) prefix += '    ';

    if (fname.substring(0, basePath.length) === basePath) {
        fwrite.out(`${prefix}* ${path.dirname(fname.substr(pthStartOffset))}/**${path.basename(fname)}**`);
        if (recurse > 0) {
            let children = srcMap[fname];
            delete srcMap[fname];
            (children || []).forEach(ch =>
                renderDep(fwrite, basePath, srcMap, depth + 1, ch, recurse - 1)
            );
        }
        else if (srcMap[fname] && srcMap[fname].length === 0) {
            delete srcMap[fname];
        }
    }
    else if (!pkg) {
        fwrite.out(`${prefix}* ${fname}`);
    }
    else if (pkg.dependencies[fname]) {
        fwrite.out(`${prefix}* ${fname} \`v${pkg.dependencies[fname]}\``);
    }
}

function writeHierarchy(fwrite, root, srcMap) {

    fwrite.out('\n-----------------------');
    fwrite.out('\n##Source Dependencies');

    Object.keys(srcMap).sort().forEach(name => {
        if (srcMap[name]) renderDep(fwrite, root, srcMap, 0, name, 2)
    });
}

function writeUrlRefs(fwrite, urls) {
    if (urls.length > 0) {
        fwrite.out('\n-----------------------');
        fwrite.out('\n##External References');
        fwrite.out('');
        urls.sort().forEach(url => fwrite.out(`* \`${url}\``));
        fwrite.out('');
    }
}

function writeFunction(fwrite, root, file, fun, addSource) {
    if ((!fun.params || fun.params.length === 0) && fun.meta.code
        && fun.meta.code.paramnames && fun.meta.code.paramnames.length > 0) {
        fun.params = fun.meta.code.paramnames.map(n => { return {name:n}; });
    }

    let retval = (fun.returns || [{}])[0];
    let returns = '';
    if (retval.type) {
        returns = ` ➪ ${retval.type.names[0]||''}`
    }

    fwrite.out(`\n### ${fun.name}(${(fun.params || []).map(p => p.name).join(', ')})${returns}`);
    if (fun.description)
        fwrite.out(`> ${fun.description}`)
    fwrite.out(`\n**Kind**: ${fun.scope} ${fun.kind}`);
    if (fun.params && fun.params.length) {
        fwrite.out('\n| Param | Type | Description |\n| --- | --- | --- |');
        fun.params.forEach(p => {
            let type = (((p.type||{}).names || [])[0] || 'object');
            fwrite.out(`| ${p.name} | \`${type}\` | ${p.description || ''} |`)
        })
    }

    if (retval.type) {
        fwrite.out(`\n**Returns**: ${retval.type.names[0]||''}${retval.description ? (' - ' + retval.description) : ''}`);
    }
    if (addSource) {
        let fullpath = path.join(fun.meta.path, fun.meta.filename);
        if (fs.existsSync(fullpath) && fun.meta.range && fun.meta.range.length === 2) {
            fwrite.out('```javascript');
            fs.readFileSync(fullpath).toString().substring(fun.meta.range[0], fun.meta.range[1])
                .split('\n')
                .forEach(line => {fwrite.out(line)});
            fwrite.out('```');
        }
    }

    fwrite.out('');
}

function selectJsDoc(a, b) {
    if (!a) return b;
    if (!b) return a;
    if ((!a.comment && b.comment) || (!a.returns && b.returns) ||
        (!(a.params && a.params.length) && (b.params && b.params.length)))
        return b;
    else
        return a;
}

function writeSourceDocs(fwrite, root, jsdocs, examplesOnly) {
    examplesOnly = examplesOnly === true;

    if (jsdocs && jsdocs.length > 0) {
        let files = {};
        jsdocs.forEach(c => {
            if (c.kind === 'function' && !c.async && c.scope === 'global' && c.meta) {
                let pth = path.join(c.meta.path, c.meta.filename);
                if (pth && (c.meta.filename === 'examples.js') === examplesOnly)
                    (files[pth] = files[pth] || []).push(c);
            }
        });

        if (Object.keys(files).length) {
            fwrite.out('\n-----------------------');
            fwrite.out(examplesOnly ? '\n##Code Examples' : '\n##Code Documentation');
        }

        let first = true;
        Object.keys(files).sort().forEach(file => {
            if (!first) {
                fwrite.out('\n-----------------------');
            }
            first = false;
            fwrite.out('\n## ' + path.basename(file));
            fwrite.out(`\n\`${file.substr(pthStartOffset)}\``);
            let funcs = {};
            files[file].forEach(f => { funcs[f.name] = selectJsDoc(funcs[f.name], f); });

            Object.keys(funcs).sort().forEach(fname => {
                writeFunction(fwrite, root, file, funcs[fname], examplesOnly);
            });
        });
    }
}

module.exports = function inspectJavascript(rootPaths) {

    const srcMap = {};
    const codeFiles = [];

    rootPaths = rootPaths || process.cwd();
    rootPaths.split(';').forEach(rootPath => {
        if (!rootPath) return;
        expandFiles(rootPath, /\.jsx?$/i, codeFiles, ['node_modules']);
    });

    let jsdocs = jsdocapi.explainSync({files: codeFiles, destination: './api-docs'});

    codeFiles.forEach(file => {
        let deps = precinct(file, {amd: {skipLazyLoaded: true}, es6: {mixedImports: true}});
        deps = deps.filter((i, p) => deps.indexOf(i) === p).sort();
        srcMap[path.resolve(file)] = deps.map(d => {
            let fqdep = path.join(path.dirname(file), d);
            if (fs.existsSync(fqdep)) return path.resolve(fqdep);
            if (fs.existsSync(fqdep + '.js')) return path.resolve(fqdep + '.js');
            return d;
        });
    });

    const env = {};
    const urls = [];
    codeFiles.forEach(file => {
        if (path.basename(file) === 'examples.js')
            return;
        let src = fs.readFileSync(file).toString();
        src.replace(/process\.env\.(\w+)(\s*\|\|\s*((["'`]([^"'`]*)["'`])|(\d+(\.\d+)?)))?/g,
            (orig, key, g2) => {
                let m, def;
                if (g2 && (m = g2.match(/["'`]([^"'`]*)["'`]/)))
                    def = m[1];
                else if (g2 && (m = g2.match(/(\d+(\.\d+)?)/)))
                    def = m[1];
                env[key.toUpperCase()] = def;
                return orig;
            });
        src.replace(/(["'`]https?:\/\/.*?)[,;]?$/gm,
            (orig, value) => {
                value = value.replace(/["`]/g,"'").replace(/\s+/g, '');
                if (urls.indexOf(value) < 0)
                    urls.push(value);
                return orig;
            });
    });

    //fs.writeFileSync('./jsdocs.json', JSON.stringify(jsdocs, null, 2));

    return {
        root: path.resolve(process.cwd()).replace(/\/$/, '') + '/',
        env: env,
        urls: urls,
        dependencies: srcMap,
        jsdocs: jsdocs,
        writeUrlRefs: function(fwrite) { return writeUrlRefs(fwrite, urls); },
        writeSourceDocs: function(fwrite) { return writeSourceDocs(fwrite, this.root, this.jsdocs, false); },
        writeExampleDocs: function(fwrite) { return writeSourceDocs(fwrite, this.root, this.jsdocs, true); },
        writeHierarchy: function(fwrite) { return writeHierarchy(fwrite, this.root, this.dependencies); },
        writeEnvironment: function(fwrite, envs) {
            let fullEnv = {};
            envs = envs || [];
            envs.push(this.env);
            envs.forEach(e => { Object.keys(e).forEach(k => { fullEnv[k] = fullEnv[k] || e[k]; }); });
            ['ENDPOINT_NAME', 'ENDPOINT_VERSION'].forEach(k => delete fullEnv[k]);

            fwrite.out('\n-----------------------');
            fwrite.out('\n##Environment Variables');
            Object.keys(fullEnv).sort().forEach(k => {
                fwrite.out(`* **${k.toUpperCase()}** = \`${fullEnv[k] || '[no-default]'}\``);
            });
        }
    }
};
