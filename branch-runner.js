if (Meteor.isClient) {

  Meteor.startup(function () {

    setInterval(function () {
      Meteor.call("getServerTime", function (error, result) {
        Session.set("time", result);
      });
    }, 2000);

    // setInterval(function () {
      Meteor.call("getBranches", function(error, result) {
        resultList = [];
        result.forEach(function(val, i) {
          resultAssoc = {};
          resultAssoc['name'] = val;
          resultList.push(resultAssoc);
        });
        Session.set("remoteBranches", resultList);
        console.log(Session.get("remoteBranches"));
      });
    // }, 5000);

  });

  Template.body.helpers({

    time: function() {
      return Session.get("time");
    },

    branches: function() {
      return Session.get('remoteBranches');
    },

  });
}

if (Meteor.isServer) {


  var Future = Npm.require('fibers/future');
  spawn = Npm.require('child_process').spawn;

  // config
  var serviceName = 'Test App';
  // var baseDir = "/home/jono/files/"
  // var dockerfilesDir = baseDir + "/lcd-test-app";
  var localGitDir = '/home/jono/files/lcd-test-app';
  var dockerfilesDir = localGitDir;
  // end config


  function getRemoteBranches() {

    var future = new Future();

    command = spawn('sh', ['-c',
    "git --git-dir=" + localGitDir + "/.git branch --remote|sed 's/[^/]*\\///'"]);

    command.stdout.on('data', function (data) {
      var branchNames = (""+data).trim().split("\n");

      future.return(branchNames);
    });

    command.stderr.on('data', function (data) {
      console.log("stderr: " + data);
    });

    return future.wait();
  }

  function getRunningBranches() {
    var future = new Future();

    command = spawn('sh', ['-c',
    "docker ps --format '{{.Names}}\t{{.Ports}}' | grep _web_1 | sed 's/_web_1//' | sed 's/0.0.0.0://' | sed 's/->.*//'"]);

    command.stdout.on('data', function (data) {
      var branches = (""+data).trim().split("\n");
      console.log('running branches: ' + branches);

      future.return(branches);
    });

    return future.wait();
  }

  Meteor.methods({
    getServerTime: function () {
      console.log('getting time');
        var _time = (new Date).toTimeString();
        console.log(_time);
        return _time;
    },

    getBranches: function() {
      var allBranches = getRemoteBranches();
      var runingBranches = getRunningBranches();

      return allBranches;
    }

  });

  Meteor.startup(function () {
    console.log('server start');
  });
}
