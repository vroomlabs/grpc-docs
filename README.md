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
