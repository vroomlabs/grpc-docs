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

module.exports = {
    expandFiles: function expandFiles(parent, exp, arr, excluded) {
        if (!fs.existsSync(parent)) {
            return arr;
        }

        let all = fs.readdirSync(parent, {flag: 'r'})
            .filter(x => excluded.indexOf(x) < 0);
        all.filter(i => i.match(exp))
            .forEach(i => arr.push(path.join(parent, i)));
        all.filter(i => fs.lstatSync(path.join(parent, i)).isDirectory())
            .forEach(i => expandFiles(path.join(parent, i), exp, arr, excluded))

        return arr;
    },
    replaceInText: function replaceInText(input, getValue) {
        return input.replace(
            /\$(([a-z0-9]+(_[a-z0-9]+)*)|(\(([\w\-_]+)\))|({([\w\-_]+)}))/gi,
            function (text, g1, m1, g3, g4, m2, g6, m3) {
                let name = (m1 || m2 || m3).toUpperCase();
                return getValue(name) || `$(${name})`;
            }
        );
    }
};
