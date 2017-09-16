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

console.log(`\n# ${gitname}`);

console.log('\n-----------------------');
console.log('\n##Summary');
console.log('\n' + pkg.description);
console.log(`\n**Repository**: ${gitrepo}`);
console.log('\n`git clone ' + gitrepo + '`');
console.log(`\n**Entry Point**: \`${pkg.main || 'unspecified'}\``);

console.log('\n-----------------------');
console.log('\n##Useful Links');
console.log('* [Repository](https://bitbucket.org/tdalabs/' + querystring.escape(gitname) + ')')
if (pkg.bugs) console.log('* [Issue Tracking](' + pkg.bugs + ')');
if (pkg.homepage) console.log('* [Documentation](' + pkg.homepage + ')');

console.log('\n-----------------------');
console.log('\n##Environments');
function outenv(name, env) {
    console.log('\n### ' + name.toLowerCase());
    console.log('* **Service Name**: ' + env.name);
    console.log('* **Project Name**: ' + env['google-project']);
    console.log('* **Hosted URL**: [' + env.host + '](https://' + env.host + ')');
    console.log(`* **Endpoint**: [${env.endpointFormat}](https://console.cloud.google.com/endpoints/api/${env.endpointFormat}/overview?project=${env['google-project']})`);
    console.log('* **API Keys**: [Get an API Key](https://console.cloud.google.com/apis/credentials?project=' + env['google-project'] + ')');
    let loglink = `https://console.cloud.google.com/logs/viewer?project=${env['google-project']}&resource=container&logName=` +
        querystring.escape(`projects/${env['google-project']}/logs/${env.name}`);
    console.log('* **Log Viewer**: [View Recent Logs](' + loglink + ')');
}
if (environment.prod || environment.production) {
    outenv((environment.prod ? 'prod' : 'production'), environment.prod || environment.production);
}
Object.keys(environment).filter(n => (n !== 'prod' && n !== 'production'))
    .forEach(n => outenv(n, environment[n]));

console.log(`\n##Contact Information\n`);
Object.keys(authors).forEach(a => console.log('* ' + a));
console.log('');

console.log('\n-----------------------');
console.log('\n##Development Information');
console.log('    npm install --progress=false');
if (pkg.scripts && pkg.scripts.babel)
    console.log('    npm run babel');
console.log('    npm start');
if (pkg.scripts && pkg.scripts.esp) {
    console.log('\nYou **must have** a json google cloud key with access to the dev endpoint stored in the following path:');
    console.log('\n    ./keys/serviceaccount.json\n');

    console.log('\nIn another terminal session run:');
    console.log('\n    npm run esp');
    console.log('\nView the service via [127.0.0.1:8000](http://127.0.0.1:8000)');
}

console.log('\n###environment variables:');
let envKeys = Object.keys(allenv);
envKeys.sort().forEach(k => {
    console.log(`* **${k}** = \`${allenv[k] || '[no-default]'}\``);
});

console.log('\n###npm run scripts:');
Object.keys(pkg.scripts || {})
    .forEach(k => console.log(`\`${k}\``));
//    .forEach(k => console.log(`\n**${k}** \n\n    ${pkg.scripts[k]}`));

console.log('\n###npm dependencies:');
Object.keys(pkg.dependencies || {})
    .forEach(k => console.log(`\`${k}\``));

console.log('\n###npm dev-dependencies:');
Object.keys(pkg.devDependencies || {})
    .forEach(k => console.log(`\`${k}\``));

// API - HELPERS
function toCamelCase(name) {
    return (name||'').replace(/_[a-z]/gi, function(m) {
        return m[1].toUpperCase();
    });
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
        case 'bool': return "false // boolean";
        case 'string': return "'string'";
        case 'bytes': return "'0==' // Base-64 Encoded String?";
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
        if (fld.rule === 'repeated') {
            example[jsName] = [example[jsName]];
        }
        else if (fld.rule === 'map') {
            let type = example[jsName];
            let ktype = typeNameToExample(root, fld.keytype).replace(/, \/\/.*$/, '');
            example[jsName] = {};
            example[jsName][ktype] = type;
        }
    });
    return example;
}
if (jsonAPI && jsonAPI.length > 0) {
    console.log('\n-----------------------');
    console.log('\n##API Specification');

    jsonAPI.forEach(pfs => {
        console.log(`\n **Location**: \`${pfs.filename}\``);
        pfs.proto.services.forEach(svc => {
            console.log(`\n### ${svc.key} Members`);
            Object.keys(svc.rpc || {}).forEach(member => {
                let cls = svc.rpc[member];
                if (!cls || !cls.options) return;
                console.log(`\n#### ${member}:`);

                let doc = jsdocs.filter(c => !c.async && c.kind === 'function'
                && c.meta.filename.toLowerCase() === (path.basename(pfs.filename, '.proto') + '.js').toLowerCase()
                && c.name.toLowerCase() === member.toLowerCase())[0];
                if (doc && doc.meta)
                    console.log(`\n**Implementation**: ${doc.meta.filename} (line ${doc.meta.lineno})`);
                if (doc && doc.description)
                    console.log(`\n> ${doc.description}`);

                let mthd = null;
                'get,put,post,delete,patch'.split(',')
                    .filter(method => cls.options['(google.api.http).' + method])
                    .forEach(method => console.log(`\n**HTTP Binding**: \`${mthd = method.toUpperCase()} ${cls.options['(google.api.http).' + method]}\``));
                console.log(`\n**Request: ${cls.request}**`);
                console.log('\n    ' + JSON.stringify(msgNameToJson(pfs.proto, cls.request), null, 2)
                        .split('\n').join('\n    ').replace(/"/g, ''));
                if (mthd !== 'GET' && mthd !== 'DELETE') {
                    let body = cls.options['(google.api.http).body'] || '*';
                    if (body === '*') {
                        console.log(`\n*Note*: Pass this as the request body.`);
                    } else {
                        console.log(`\n*Note*: Pass only the **${body}** field in the request body.`);
                    }
                }

                console.log(`\n**Response: ${cls.response}**`);
                console.log('\n    ' + JSON.stringify(msgNameToJson(pfs.proto, cls.response), null, 2)
                        .split('\n').join('\n    ').replace(/"/g, ''));
            });
        });
    });
}
console.log('\n-----------------------');
//console.log(`\nGenerated on ${new Date().toLocaleString()}`);
