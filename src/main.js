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
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const child_process = require('child_process');
const YAML = require('yamljs');
const jsdocapi = require('jsdoc-api');

const protoPath = process.argv[2] || './proto/';
const options = {
    source: 'proto',
    path: [path.resolve(protoPath)]
};

const docPath = path.join(process.cwd(), process.argv[3] || './docs/');
if (!fs.existsSync(docPath)) fs.mkdirSync(docPath);

function expandFiles(parent, exp, arr) {
    let all = fs.readdirSync(parent, {flag: 'r'})
        .filter(x => x !== 'google' && x !== 'docs' && x !== 'node_modules');
    all.filter(i => i.match(exp))
        .forEach(i => arr.push(path.join(parent, i)));
    all.filter(i => fs.lstatSync(path.join(parent, i)).isDirectory())
        .forEach(i => expandFiles(path.join(parent, i), exp, arr))
    return arr;
}
function replaceInText(input, getValue) {
    return input.replace(
        /\$(([a-z0-9]+(_[a-z0-9]+)*)|(\(([\w\-_]+)\))|({([\w\-_]+)}))/gi,
        function (text, g1, m1, g3, g4, m2, g6, m3) {
            let name = (m1 || m2 || m3).toUpperCase();
            return getValue(name) || `$(${name})`;
        }
    );
}
function flattenProtoSpec(spec, collection) {
    if (!spec.isNamespace) {
        collection.messages.push(spec);
        return spec;
    }
    (spec.messages || []).forEach(ch => {
        ch.key = ch.name;
        ch.name = spec.name ? `${spec.name}.${ch.name}` : ch.name;
        ch = flattenProtoSpec(ch, collection);
        if (ch.isNamespace && ch.options) {
            spec.options = Object.assign(spec.options || {}, ch.options);
        }
    });
    spec.messages = (spec.messages || []).filter(n => !n.isNamespace);
    if (spec !== collection) {
        (spec.services || []).forEach(svc => {
            svc.key = svc.name;
            svc.name = spec.name ? `${spec.name}.${svc.name}` : svc.name;
            collection.services.push(svc);
        });
    }
    return spec;
}

// Gather proto files.
const sourceFiles = expandFiles(protoPath, /\.proto$/i, []);
const deployFiles = expandFiles('./', /^deploy.ya?ml$/i, []);

let jsonAPI = [];
if (sourceFiles.length) {
    const parser = require('protobufjs/cli/pbjs/sources/proto');
    const jsonoutput = require('protobufjs/cli/pbjs/targets/json');

    jsonAPI = sourceFiles.map(file => {
        let protoSpec = JSON.parse(jsonoutput(parser([file], options), options));
        protoSpec.messages = (protoSpec.messages || []).filter(m => m.name !== 'google');
        protoSpec.services = protoSpec.services || [];
        protoSpec = flattenProtoSpec(protoSpec, protoSpec);
        return {
            filename: file,
            proto: protoSpec
        };
    });
}
//fs.writeFileSync('spec.json', JSON.stringify(jsonAPI, null, 2));

let jsdocs = jsdocapi.explainSync({ files: 'src/**/*.js', destination: 'api-docs' });
//fs.writeFileSync('jsdocs.json', JSON.stringify(jsdocs, null, 2));

// Read gsdk-deploy's configuration
let environment = {};
if (deployFiles.length === 1) {
    const DeployConfig = require('@vroomlabs/gsdk-deploy/lib/config/deployConfig').DeployConfig;
    environment = YAML.parse(fs.readFileSync(deployFiles[0]).toString());
    Object.keys(environment).forEach(key => {
        while (environment[key].extends) {
            let parent = environment[key].extends;
            delete environment[key].extends;
            environment[key] = Object.assign({}, environment[parent], environment[key]);
        }
        environment[key] = Object.assign({}, new DeployConfig(), environment[key]);
    });
    delete environment.base;
    Object.keys(environment).forEach(key => {
        let tmp = JSON.stringify(environment[key]);
        tmp = replaceInText(tmp, n => {
            if (n === 'SERVICE_NAME') return environment[key].name;
            if (n === 'GCLOUD_PROJECT') return environment[key]['google-project'];
        });
        tmp = replaceInText(tmp, n => {
            if (n === 'BRANCH') return key;
        });
        environment[key] = JSON.parse(tmp);
    });
    //fs.writeFileSync('env.json', JSON.stringify(environment, null, 2));
}

// Get all environment options
let allenv = {};
Object.keys(environment)
    .forEach(enm => (environment[enm].env || [])
        .forEach(kv => { allenv[kv.name] = kv.value && kv.value.indexOf('$') < 0 ? kv.value : null }));
fs.readFileSync('Dockerfile').toString().split('\n')
    .map(l => l.match(/^ENV (\w+)(\s.*)?$/))
    .filter(l => l)
    .forEach(m => {
        let val =m[2];
        if (val) {
            val = val.replace(/^[\s=]+/, '');
            val = val.match(/^'.*'$/) ? val.substr(1, val.length-2) : val;
        }
        allenv[m[1].toUpperCase()] = val;
    });
delete allenv.ENDPOINT_NAME;
delete allenv.ENDPOINT_VERSION;

let authors = {};
child_process.execSync('git log -n 50')
    .toString().split('\n')
    .filter(line => line.match(/^Author/))
    .map(line => line.substr(8))
    .forEach(author => authors[author] = 0);

let gitrepo = child_process.execSync('git remote -v').toString().split('\n')
    .map(l => (l.match(/git@[\w-:\./]+.git/) || [])[0])
    .filter(l => l)
    [0];

let gitname = gitrepo.match(/\/([^/]*)\.git$/)[1];

let pkg = require(path.resolve(process.cwd(), './package.json'));

let fwrite = {
    _lines: [],
    out: function(line) { this._lines.push(line); },
    save: function(fname) { fs.writeFileSync(fname, this._lines.join('\n')); this._lines = []; }
};

fwrite.out(`\n# ${gitname}`);

fwrite.out('\n-----------------------');
fwrite.out('\n##Summary');
fwrite.out('\n' + pkg.description);
fwrite.out(`\n**Repository**: ${gitrepo}`);
fwrite.out('\n`git clone ' + gitrepo + '`');
fwrite.out(`\n**Entry Point**: \`${pkg.main || 'unspecified'}\``);

fwrite.out('\n-----------------------');
fwrite.out('\n##Useful Links');
//fwrite.out('* [Repository](https://bitbucket.org/tdalabs/' + querystring.escape(gitname) + ')')
if (jsonAPI && jsonAPI.length > 0) fwrite.out('* [API Specification](docs/API.md)');
if (jsdocs && jsdocs.length > 0) fwrite.out('* [Code Documentation](docs/CODE.md)');
if (pkg.bugs) fwrite.out('* [Issue Tracking](' + pkg.bugs + ')');
if (pkg.homepage) fwrite.out('* [Documentation](' + pkg.homepage + ')');

fwrite.out('\n-----------------------');
fwrite.out('\n##Environments');
function outenv(name, env) {
    fwrite.out('\n### ' + name.toLowerCase());
    fwrite.out('* **Service Name**: ' + env.name);
    fwrite.out('* **Project Name**: ' + env['google-project']);
    fwrite.out('* **Hosted URL**: [' + env.host + '](https://' + env.host + ')');
    if (env.endpointFormat && jsonAPI && jsonAPI.length > 0) {
        fwrite.out(`* **Endpoint**: [${env.endpointFormat}](https://console.cloud.google.com/endpoints/api/${env.endpointFormat}/overview?project=${env['google-project']})`);
        fwrite.out('* **API Keys**: [Get an API Key](https://console.cloud.google.com/apis/credentials?project=' + env['google-project'] + ')');
    }
    let loglink = `https://console.cloud.google.com/logs/viewer?project=${env['google-project']}&resource=container&logName=` +
        querystring.escape(`projects/${env['google-project']}/logs/${env.name}`);
    fwrite.out('* **Log Viewer**: [View Recent Logs](' + loglink + ')');
}
if (environment.prod || environment.production) {
    outenv((environment.prod ? 'prod' : 'production'), environment.prod || environment.production);
}
Object.keys(environment).filter(n => (n !== 'prod' && n !== 'production'))
    .forEach(n => outenv(n, environment[n]));

fwrite.out('\n-----------------------');
fwrite.out(`\n##Contact Information\n`);
Object.keys(authors).forEach(a => fwrite.out('* ' + a));
fwrite.out('');

fwrite.out('\n-----------------------');
fwrite.out('\n##Development Information');
fwrite.out('    npm install --progress=false');
if (pkg.scripts && pkg.scripts.babel)
    fwrite.out('    npm run babel');
fwrite.out('    npm start');
if (pkg.scripts && pkg.scripts.esp) {
    fwrite.out('\nYou **must have** a json google cloud key with access to the dev endpoint stored in the following path:');
    fwrite.out('\n    ./keys/serviceaccount.json\n');

    fwrite.out('\nIn another terminal session run:');
    fwrite.out('\n    npm run esp');
    fwrite.out('\nView the service via [127.0.0.1:8000](http://127.0.0.1:8000)');
}

fwrite.out('\n###environment variables:');
let envKeys = Object.keys(allenv);
envKeys.sort().forEach(k => {
    fwrite.out(`* **${k}** = \`${allenv[k] || '[no-default]'}\``);
});

fwrite.out('\n###npm run scripts:');
Object.keys(pkg.scripts || {})
    .forEach(k => fwrite.out(`\`${k}\``));
//    .forEach(k => fwrite.out(`\n**${k}** \n\n    ${pkg.scripts[k]}`));

fwrite.out('\n###npm dependencies:');
Object.keys(pkg.dependencies || {})
    .forEach(k => fwrite.out(`\`${k}\``));

fwrite.out('\n###npm dev-dependencies:');
Object.keys(pkg.devDependencies || {})
    .forEach(k => fwrite.out(`\`${k}\``));

fwrite.out('\n-----------------------');
fwrite.save('README.md');

// API - HELPERS
function toCamelCase(name) {
    return (name||'').replace(/_[a-z]/gi, function(m) {
        return m[1].toUpperCase();
    });
}
function writeDocs(type, prefix, options) {
    if (options && options[`(docs.${type}).summary`]) {
        options[`(docs.${type}).summary`].split('\n')
            .forEach(line => fwrite.out(`${prefix}${line}`));
    }
    if (options && options[`(docs.${type}).overview`]) {
        options[`(docs.${type}).overview`].split('\n')
            .forEach(line => fwrite.out(`${prefix}${line}`));
    }
}
function typeNameToExample(root, name) {
    switch(name) {
        case 'double': return '0.0, // double';
        case 'float': return '0.0, // float';
        case 'int32': return '0, // int32';
        case 'int64': return "'0', // int64 as string";
        case 'uint32': return '0, // uint32';
        case 'uint64': return "'0', // uint64 as string";
        case 'sint32': return '0, // sint32';
        case 'sint64': return "'0', // sint64 as string";
        case 'fixed32': return '0.0, // fixed32';
        case 'fixed64': return "'0.0', // fixed64 as string";
        case 'sfixed32': return '0.0, // sfixed32';
        case 'sfixed64': return "'0.0', // sfixed64 as string";
        case 'bool': return "false, // boolean";
        case 'string': return "'string',";
        case 'bytes': return "'0==', // bytes";
        default:
            return msgNameToJson(root, name);
    }
}
function msgNameToJson(root, name) {
    let msg = root.messages.filter(m => m.key === name)[0];
    if (!msg) return null;
    let example = {};
    msg.fields.forEach(fld => {
        let jsName = toCamelCase(fld.name);
        example[jsName] = typeNameToExample(root, fld.type);

        if (typeof example[jsName] === 'string' && fld.options && fld.options[`(docs.field).summary`]) {
            if (!example[jsName].match(/\/\//)) example[jsName] += ' // ';
            else example[jsName] += ' - ';
            example[jsName] += fld.options[`(docs.field).summary`].replace(/\n/g, ' ');
        }

        if (fld.rule === 'repeated') {
            example[jsName] = [example[jsName]];
        }
        else if (fld.rule === 'map') {
            let type = example[jsName];
            let ktype = typeNameToExample(root, fld.keytype).split(',')[0];
            example[jsName] = {};
            example[jsName][ktype] = type;
        }
    });
    return example;
}
if (jsonAPI && jsonAPI.length > 0) {
    fwrite.out('\n##API Specification');
    fwrite.out('\n-----------------------');

    jsonAPI.forEach(pfs => {
        writeDocs('file', '\n> ', pfs.proto.options);
        fwrite.out(`\n **Location**: \`${pfs.filename}\``);
        pfs.proto.services.forEach(svc => {
            fwrite.out(`\n### ${svc.key} Service`);
            writeDocs('service', '\n> ', svc.options);
            Object.keys(svc.rpc || {}).forEach(member => {
                let cls = svc.rpc[member];
                if (!cls || !cls.options) return;
                fwrite.out(`\n#### ${member}:`);
                writeDocs('method', '\n> ', cls.options);

                let doc = jsdocs.filter(c => !c.async && c.kind === 'function'
                && c.meta.filename.toLowerCase() === (path.basename(pfs.filename, '.proto') + '.js').toLowerCase()
                && c.name.toLowerCase() === member.toLowerCase())[0];
                if (doc && doc.description)
                    fwrite.out(`\n> ${doc.description}`);
                if (doc && doc.meta)
                    fwrite.out(`\n**Implementation**: ${doc.meta.filename} (line ${doc.meta.lineno})`);

                let mthd = null;
                'get,put,post,delete,patch'.split(',')
                    .filter(method => cls.options['(google.api.http).' + method])
                    .forEach(method => fwrite.out(`\n**HTTP Binding**: \`${mthd = method.toUpperCase()} ${cls.options['(google.api.http).' + method]}\``));

                fwrite.out(`\n**Request: ${cls.request}**`);
                fwrite.out('```javascript');
                fwrite.out(JSON.stringify(msgNameToJson(pfs.proto, cls.request), null, 4)
                    .replace(/"/g, '').replace(/,$/gm, ''));
                fwrite.out('```');

                if (mthd !== 'GET' && mthd !== 'DELETE') {
                    let body = cls.options['(google.api.http).body'] || '*';
                    if (body === '*') {
                        fwrite.out(`\n*Note*: Pass this as the request body.`);
                    } else {
                        fwrite.out(`\n*Note*: Pass only the **${body}** field in the request body.`);
                    }
                } else {
                    fwrite.out(`\n*Note*: Pass the above fields as query string parameters.`);
                }

                fwrite.out(`\n**Response: ${cls.response}**`);
                let msg = pfs.proto.messages.filter(m => m.key === cls.response)[0];
                if (msg) {
                    writeDocs('method', '\n> ', cls.options);
                    fwrite.out('```javascript');
                    fwrite.out(JSON.stringify(msgNameToJson(pfs.proto, cls.response), null, 4)
                        .replace(/"/g, '').replace(/,$/gm, ''));
                    fwrite.out('```');
                }
            });
        });
    });
    fwrite.out('\n-----------------------');
    fwrite.save(path.resolve(docPath, 'API.md'));
}

if (jsdocs && jsdocs.length > 0) {
    fwrite.out('\n##Code Documentation');
    fwrite.out('\n-----------------------');

    let files = {};
    jsdocs.forEach(c => {
        if (c.kind === 'function' && !c.async && c.scope === 'global' && c.meta) {
            let pth = path.join(c.meta.path, c.meta.filename);
            if (pth)
                (files[pth] = files[pth] || []).push(c);
        }
    });
    Object.keys(files).sort().forEach(file => {
        fwrite.out('\n## ' + path.basename(file));
        fwrite.out(`\n\`${path.dirname(file)}\``);
        let funcs = {};
        files[file].forEach(f => funcs[f.name] = f);
        Object.keys(funcs).sort().forEach(fname => {
            let fun = funcs[fname];
            if ((!fun.params || fun.params.length === 0) && fun.meta.code
                && fun.meta.code.paramnames && fun.meta.code.paramnames.length > 0) {
                fun.params = fun.meta.code.paramnames.map(n => { return {name:n}; });
            }

            fwrite.out(`\n### ${fun.name}(${(fun.params || []).map(p => p.name).join(', ')})`);
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
            fwrite.out('');
        });
        fwrite.out('\n-----------------------');
    });
    fwrite.save(path.resolve(docPath, 'CODE.md'));
}
