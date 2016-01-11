# branchr

A continuous delivery pipeline for running git branches of a web service.

## Requirements
* Docker
* docker-compose
* MeteorJS
* git

The app you want to run should be managed by git, have a Docker image for it and a compose file. Compose file needs to have environment variables for ports.

## Usage

Make sure you can run docker without sudo.

Checkout some git project(s) from github and create a settings.json

Start the project with
`./run.sh`

Visit http://localhost:3000

## TODO

* queue found git changes so builds dont fall over eachother
* allow config to check for branches and commits locally or remotely
* show dates/uptime for git and docker run
* fetch unused ports instead of random ones
* parse compose file instead of setting ports in config
* show when git last commit is different then the last deployed checksum
* growl git updates?
* style it!
