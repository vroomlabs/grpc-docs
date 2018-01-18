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
const expandFiles = require('./utils').expandFiles;

// API - HELPERS
function toCamelCase(name) {
    return (name||'').replace(/_[a-z]/gi, function(m) {
        return m[1].toUpperCase();
    });
}

function writeDocs(fwrite, type, prefix, options) {
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
        case 'google.protobuf.Empty': return {};
        case 'google.protobuf.Struct': return { 'any': 'any' };
        default:
            return msgNameToJson(root, name);
    }
}

function msgNameToJson(root, name) {
    if (name === 'google.protobuf.Empty') return {};
    if (name === 'google.protobuf.Struct') return { 'any': 'any' };
    let msg = root.messageMap[name] || root.messageMap[name.split('.').slice(-1)[0]];
    if (!msg) {
        msg = root.enums.filter(m => m.key === name)[0];
        if (!msg) {
            console.error(`unable to find: ${name} in ${Object.keys(root.messageMap).join(',')}`);
            return null;
        }
        return `'${msg.values.map(v => `${v.name}`).join('|')}'`;
    }
    let example = {};
    msg.fields.forEach(fld => {
        let jsName = toCamelCase(fld.name);
        example[jsName] = typeNameToExample(root, fld.type) || fld.type;

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
            let ktype = (typeNameToExample(root, fld.keytype) || fld.keytype).split(',')[0];
            example[jsName] = {};
            example[jsName][ktype] = type;
        }
    });
    return example;
}

function flattenProtoSpec(spec, collection) {
    if (!spec.isNamespace) {
        collection.messages.push(spec);
        //return spec;
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
        (spec.enums || []).forEach(enu => {
            enu.key = enu.name;
            enu.name = spec.name ? `${spec.name}.${enu.name}` : enu.name;
            collection.enums.push(enu);
        });
    }
    return spec;
}

module.exports = function generateProtoDocs(protoPath) {

    protoPath = protoPath || './proto';
    const options = {
        source: 'proto',
        path: [path.resolve(protoPath)]
    };
// Gather proto files.
    const protos = expandFiles(protoPath, /\.proto$/i, [], ['google', 'docs']);

    let jsonAPI = [];
    if (protos.length) {
        jsonAPI = protos.map(file => {
            let parser = require('protobufjs/cli/pbjs/sources/proto');
            let target = require('protobufjs/cli/pbjs/targets/json');
            let protoSpec = JSON.parse(target(parser([file], options), options));

            protoSpec.messages = (protoSpec.messages || []).filter(m => m.name !== 'google');
            protoSpec.services = protoSpec.services || [];
            protoSpec.enums = protoSpec.enums || [];
            protoSpec = flattenProtoSpec(protoSpec, protoSpec);
            protoSpec.messageMap = {};
            let add2map = m => { protoSpec.messageMap[m.key] = m; };
            protoSpec.messages.forEach(m => add2map(m));
            //fs.writeFileSync('api.json', JSON.stringify(protoSpec, null, 2));
            return {
                filename: path.resolve(file).substr(process.cwd().length + 1),
                proto: protoSpec
            };
        });
    }

    return {
        protos: protos,
        writeApiDocs: function writeApiDocs(fwrite, jsdocs) {
            if (!jsonAPI || jsonAPI.length <= 0)
                return;

            jsdocs = jsdocs || [];
            fwrite.out('\n-----------------------');
            fwrite.out('\n##API Specification');

            jsonAPI.forEach(pfs => {
                writeDocs(fwrite, 'file', '\n> ', pfs.proto.options);
                fwrite.out(`\n **Location**: \`${pfs.filename}\``);
                pfs.proto.services.forEach(svc => {
                    fwrite.out(`\n### ${svc.key} Service`);
                    writeDocs(fwrite, 'service', '\n> ', svc.options);
                    Object.keys(svc.rpc || {}).forEach(member => {
                        let cls = svc.rpc[member];
                        if (!cls || !cls.options) return;
                        fwrite.out(`\n#### ${member}:`);
                        writeDocs(fwrite, 'method', '\n> ', cls.options);

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
                        let msg = pfs.proto.messageMap[cls.response];
                        if (msg) writeDocs(fwrite, 'method', '\n> ', cls.options);
                        fwrite.out('```javascript');
                        fwrite.out(JSON.stringify(msgNameToJson(pfs.proto, cls.response), null, 4)
                            .replace(/"/g, '').replace(/,$/gm, ''));
                        fwrite.out('```');
                    });
                });
            });
        }
    };
};
