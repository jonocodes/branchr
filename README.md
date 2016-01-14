# Branchr

A continuous delivery pipeline for running git branches of a web service.

![Screenshot](screenshot.png)

## Requirements
* Docker
* docker-compose
* git

The app you want to run should be managed by git, have a Docker image for it and a compose file. Compose file needs to have environment variables for ports.

Make sure you can [run docker without sudo](http://askubuntu.com/questions/477551/how-can-i-use-docker-without-sudo).

## Demo

Enter the sample/ dir and run the project. Then visit http://localhost:3000

### Using Docker

`./run-docker.sh`

### In development

You will need MeteorJS installed for this.

`./run-demo.sh`


## TODO

* queue found git changes so builds dont fall over eachother
* allow config to check for branches and commits locally or remotely
* show dates/uptime for git and docker run
* fetch unused ports instead of random ones
* parse compose file instead of setting ports in config
* show when git last commit is different then the last deployed checksum
* growl git updates or log them somewhere?
* finish Dockerizing
