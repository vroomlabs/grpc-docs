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
const YAML = require('yamljs');
const querystring = require('querystring');

const expandFiles = require('./utils').expandFiles;
const replaceInText = require('./utils').replaceInText;

module.exports = function loadEnvironmentInfo(deployConfig) {

    const deployFiles = deployConfig ? [deployConfig]
        : expandFiles(process.cwd(), /^deploy.ya?ml$/i, [], ['node_modules']);
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

        return {
            environments: environment,
            writeEnvironments: function(fwrite) { writeEnvironments(fwrite, this.environments); },
            getEnvSettings: function () {
                let all = {};
                Object.keys(this.environments).map(k => this.environments[k].env)
                    .forEach(coll => coll.forEach(e =>{all[e.name] = all[e.name] || e.value || undefined;}));
                Object.keys(all).forEach(k => { all[k] = (!all[k] || all[k].match(/\$/)) ? undefined : all[k]; });
                return all;
            }
        };
    }
};

function writeEnv(fwrite, name, env) {
    fwrite.out('\n### ' + name.toLowerCase());
    fwrite.out('* **Service Name**: ' + env.name);
    fwrite.out('* **Project Name**: ' + env['google-project']);
    fwrite.out('* **Hosted URL**: [' + env.host + '](https://' + env.host + ')');
    if (env.endpointFormat) {
        fwrite.out(`* **Endpoint**: [${env.endpointFormat}](https://console.cloud.google.com/endpoints/api/${env.endpointFormat}/overview?project=${env['google-project']})`);
        fwrite.out('* **API Keys**: [Get an API Key](https://console.cloud.google.com/apis/credentials?project=' + env['google-project'] + ')');
    }
    let loglink = `https://console.cloud.google.com/logs/viewer?project=${env['google-project']}&resource=container&logName=` +
        querystring.escape(`projects/${env['google-project']}/logs/${env.name}`);
    fwrite.out('* **Log Viewer**: [View Recent Logs](' + loglink + ')');
}

function writeEnvironments(fwrite, envs) {

    fwrite.out('\n-----------------------');
    fwrite.out('\n##Environments');
    if (envs.prod || envs.production) {
        writeEnv(fwrite, (envs.prod ? 'prod' : 'production'), envs.prod || envs.production);
    }
    Object.keys(envs)
        .filter(n => typeof envs[n] === 'object')
        .filter(n => (n !== 'prod' && n !== 'production'))
        .forEach(n => writeEnv(fwrite, n, envs[n]));

}
