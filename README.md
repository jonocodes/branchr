# branchr

A continuous delivery pipeline for running git branches of a web service.

## Requirements
* Docker
* docker-compose
* MeteorJS
* an app to run (preferably 12 factor)

## Usage

Make sure you can run docker without sudo.

Checkout the git project(s) from github and then set the values

Start the project with
`meteor`

## TODO

* listen for git changes and update
* enable/disable branches
* show dates for git and docker run
* style list
