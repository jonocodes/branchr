# Branchr

A continuous feature branch monitoring tool for web applications in development.

This is NOT a continuous integration server (see the FAQ). It is a way to watch and present the ongoing work done in a project.

Several non-free platform specific tools exist that solve a similar problem like [Pantheon's Multidev](https://devcenter.heroku.com/articles/github-integration-review-apps) and [Heroku's Review Apps](https://pantheon.io/features/multidev-cloud-environments). Branchr is a generic open source solution that you can run for any app anywhere.

# Screenshot

![Screenshot](screenshot.png)

## Requirements
* Docker 1.10
* docker-compose 1.6
* git
* [Meteor](https://www.meteor.com/install) 1.3 (needed for development only)

Recomended: setup docker to [run without sudo](http://askubuntu.com/questions/477551/how-can-i-use-docker-without-sudo).

## Demo

The demo will pull down a sample app and run Branchr for you. Run the project using Docker or in development mode (see below). Then visit [http://localhost:3000](http://localhost:3000)

** In development **

`demo/run.sh dev`

** Using Docker **

`demo/run.sh docker`

## Usage

The app you want to run should be managed by git, have a Docker image for it and a docker-compose file. The compose file needs to have environment variables for ports...

It is recommended that you connect to your remote git repo using an ssh key file with no pass phrase.

## FAQ

** Why use Git and Docker instead of another version control system and runtime? **

Short answer: Other backends would not be hard to implement - file a pull request.

In theory you can use any version control, but for now only git has been implemented.

I chose to start with Docker as a runtime environment because application generic/agnostic and fast. In theory Branchr can use something like Vagrant/VirtualBox, but you would be more limited in the amount of application instances because they are usually more heavy weight then containers. In theory you can use something more application specific like Tomcat or Puma if you want. Or you can use something platform specific like Amazon or Heroku.


** How is this different then continuous integration? **

Continuous Integration servers are best for running specific branches and automating builds against them. Continuous Delivery servers a best for doing production deployments. The use case here is different. The goal is to be able to watch feature branches as they are being developed. Good uses for this is when your team wants to be able to see the direction a long running feature is going. QA can smoke test a visual change without having to figure out how to bring up the whole stack. Product can do casual UAT without servers having to be babysat and deployed to.


** Instead of creating a standalone web app why not implement this for an existing CI server? **

I did look at what it would take to implement this as a Jenkins plugin. Most existing CI tools can listen to specific git branches for changes or the entire repo. But they do not provide information about branches coming in and out of existence. I started to implement the logic to capture more granular branch changes and realized I was trying to make these tools do more then they were built for. The [fist pass of this project](https://github.com/jonocodes/branch-runner-lcd) was done using a great pipeline builder called [LambdaCD](http://www.lambda.cd). I got it mostly working, but started to run into similar issues.


** Why Meteor? **

Meteor provides server to client binding out of the box. Since this app manages many services, it does a lot of logging, setting, status fields, and real time monitoring. The web app itself should be fairly small. The goal is to have a small dashboard that gives a real time view of the heavy lifting Docker and git are doing. Meteor makes this very easy.

## TODO

* explain settings.json in readme
* queue found git changes so builds dont fall over each other. perhaps:  https://atmospherejs.com/vsivsi/job-collection
* if no queue, write checkouts to separate directories, as capistrano does with git archive?
* allow config to check for branches and commits locally or remotely
* timeout random port checking
* parse compose file instead of setting ports in config
* stop a running stack when its branch disappears
* show when git last commit is different then the last deployed checksum
* growl git updates or log them somewhere?
* animated screenshot for readme - FFcast, gifify, LICEcap, silentcast?
