# grpc-docs

Auto-generator for markdown documentation

## Usage:

    $ npm install --save-dev @vroomlabs/grpc-docs
    ./node_modules/.bin/grpc-docs

## Scripts:

package.json script:

    "scripts": {
        "doc": "grpc-docs"
    }

## Requirements:

If you are not already using gsdk-deploy, create the following `deploy.yaml` file in the root of your project.

    # =============================================================================
    # = Deployment configuration
    # =============================================================================
    dev:
      name: "search"
      host: "search-dev.catalog.com"
      google-project: "my-google-project-id"
      endpointFormat: ""
      env: []
    # =============================================================================
    prod:
      extends: dev
      google-project: "my-google-project-id"
      host: "search.catalog.com"
    # =============================================================================

## Changing Default Paths:

Modify package.json to include any or all of the following:

    "grpc-docs": {
        "source": "./config/;./api/;"   // search path for all source files, default = /src;/config
        "deploy": './deploy.yaml',      // where to find the above deploy.yaml file
        "docker": './Dockerfile',       // where to find the associated docker file for run/env info
        "proto": './proto/',            // where to find proto files (if any)
        "output": './README.md'         // where to write the output documentation file
    }

## Customizing Output:

Currently there is only one thing that can be manually written and automatically injected into the output, examples. Create a file named "examples.js" anywhere in the source search path. Export each example as a function from that source file.

### examples.js
    /**
     * A simple example method exists inside a file named "examples.js"
     * @param {string} text - A parameter we use in this example
     */
    function exampleMethodName(text) {
        // do something.
    }


