/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

var ProtoBuf = require('protobufjs/dist/protobuf');
var fs = require("fs");
var node_path = require("path");

var util = {

    getBuilderOptions: function (options, prefix) {
        if (!options[prefix])
            return {};
        var builderOptions = {};
        options[prefix].forEach(function (kv) {
            var key, val;
            var p = kv.indexOf("=");
            if (p < 0) {
                key = kv;
                val = true;
            } else {
                key = kv.substring(0, p);
                val = kv.substring(p + 1);
                if (val === "true")
                    val = true;
                else if (val === "false")
                    val = false;
                else {
                    var intval = parseInt(val, 10);
                    if (intval == val)
                        val = intval;
                }
            }
            builderOptions[key] = val;
        });
        return builderOptions;
    },

    isDescriptor: function(name) {
        return /^google\/protobuf\/descriptor/.test(name);
    }
};


var proto = module.exports = function(filenames, options) {
    options = options || [];
    var builder = ProtoBuf.newBuilder(util.getBuilderOptions(options, "using")),
        loaded = [];
    filenames.forEach(function(filename) {
        var data = proto.load(filename, options, loaded);
        builder["import"](data, filename);
    });
    builder.resolveAll();
    return builder;
};


proto.load = function(filename, options, loaded) {
    filename = node_path.resolve(filename);
    loaded = loaded || [];
    if (loaded.indexOf(filename) >= 0)
        return {};
    var data = ProtoBuf.DotProto.Parser.parse(fs.readFileSync(filename).toString("utf8"));
    loaded.push(filename);
    if (Array.isArray(data['imports'])) {
        var imports = data['imports'];
        for (var i=0; i<imports.length; i++) {
            // Skip pulled imports and legacy descriptors
            if (typeof imports[i] !== 'string' || (util.isDescriptor(imports[i]) && !options.legacy))
                continue;
            // Merge imports, try include paths
            (function() {
                var path = options.path || [];
                for (var j=0; j<path.length; ++j) {
                    var import_filename = node_path.resolve(path[j] + "/", imports[i]);
                    if (!fs.existsSync(import_filename))
                        continue;
                    imports[i] = proto.load(import_filename, options, loaded);
                    return;
                }
                throw Error("File not found: "+imports[i]);
            })();
        }
    }
    return data;
};
