
// config
var serviceName = 'Test App';
// var baseDir = "/home/jono/files/"
// var dockerfilesDir = baseDir + "/lcd-test-app";
// var localGitDir = '/home/jono/files/lcd-test-app';
var localGitDir = '/home/jfinger/src/lcd-test-app';
var dockerfilesDir = localGitDir;
// end config

Logs = new Mongo.Collection("logs");

if (Meteor.isClient) {

  Meteor.startup(function () {

    document.title = "Branchr ["+ serviceName +"]";

    setInterval(function () {
      Meteor.call("getServerTime", function (error, result) {
        Session.set("time", result);
      });
    }, 2000);

    setInterval(function () {
      Meteor.call("getBranches", function(error, result) {
        Session.set("remoteBranches", result);
        // console.log(Session.get("remoteBranches"));
      });
    }, 5000);

  });

  Template.body.helpers({

    time: function() {
      return Session.get("time");
    },

    branches: function() {
      return Session.get('remoteBranches');
    },

    log: function() {
      return Logs.find({branch:Session.get('currentBranch')});
    },

  });

  Template.branch.events({
    'click button#start': function(event, template) {
      console.log('start ' + template.data['name']);
      Session.set('currentBranch', template.data['name']);
      Meteor.call('startStack', template.data, function(error, result) {
        if (error){
          console.log(error);
        }
        // else {
        //   console.log('response: ', result);
        // }
      });
    },
    'click button#stop': function(event, template) {
      console.log('stop ' + template.data['port']);
      Session.set('currentBranch', template.data['name']);
      Meteor.call('stopStack', template.data, function(error, result) {
        if (error){
          console.log(error);
        }
        // else {
        //   console.log('response: ', result);
        // }
      });
    }
  });

}

if (Meteor.isServer) {

  var Future = Npm.require('fibers/future');
  const spawn = Npm.require('child_process').spawn;
  // const exec = Npm.require('child_process').exec;
  // var Git = Meteor.npmRequire('nodegit');    // slow startup

  // function getRemoteBranchesGit() {  // TODO: get nexted then's to work
  //   // console.log('getRemoteBranchesGit');
  //   Git.Repository.open(localGitDir + "/.git").then(function(repository) {
  //     console.log(repository);
  //
  //     Git.Branch.iteratorNew(repository, GIT_BRANCH_LOCAL).then(function(branchIterator) {
  //       console.log('branchIterator : ' + branchIterator);
  //
  //       for(let value of branchIterator){
  //         console.log("I " + value)
  //       }
  //     });
  //
  //   });
  // }


  function getRemoteBranches() {

    var future = new Future();

    command = spawn('sh', ['-c',
    "git --git-dir=" + localGitDir + "/.git branch --remote|sed 's/[^/]*\\///'"]);

    command.stdout.on('data', function (data) {
      var branchNames = (''+data).trim().split("\n");

      var resultList = [];
      branchNames.forEach(function(val, i) {
        resultAssoc = {};
        resultAssoc['name'] = val;
        resultList.push(resultAssoc);
      });

      future.return(resultList);
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

      var branches = (''+data).trim().split('\n');

      var resultList = {};
      branches.forEach(function(val, i) {
        resultAssoc = {};
        var exploded = val.split('\t');
        resultAssoc['name'] = exploded[0];
        resultAssoc['port'] = exploded[1];
        resultList[exploded[0]] = resultAssoc;
      });
      future.return(resultList);
    });

    command.stderr.on('data', function (data) {
      console.log("stderr: " + data);
    });

    command.on('close', function(code) {
      if (!future.isResolved()) {
        future.return({});
      }
    });

    return future.wait();
  }

  function getUnusedPort() {
    // TODO: check if port is used
    return Math.floor(Math.random() * (7000 - 5000)) + 5000;
  }

  function dockerNamify(name) {
    // turn into a name that is a valid for a docker container
    return name.replace(/[^a-zA-Z0-9_]/, "");
  }

  function logCommand(command, b) {

    command.stdout.on('data', Meteor.bindEnvironment(function (data) {
      // console.log(''+data);
      var body = Logs.findOne({branch:b});
      body['text'] = body['text'] + data;
      Logs.update({ branch: b }, body);
    }));

    command.stderr.on('data', Meteor.bindEnvironment(function (data) {
      // console.log('err: '+data);
      var body = Logs.findOne({branch:b});
      // body['errors'] = body['errors'] + data;
      body['text'] = body['text'] + String(data);
      Logs.update({ branch: b }, body);
    }));

    command.on('close', Meteor.bindEnvironment( function (code) {
      var body = Logs.findOne({branch:b});
      body['text'] = body['text'] + "\n= DONE =";
      Logs.update({ branch: b }, body);
      // TODO: force refresh here instead of waiting
    }));
  }

  Meteor.methods({

    startStack: function(branch) {
      var b = branch['name'];
      var port = getUnusedPort();

      console.log("starting stack " + b + " port: " + port);

      Logs.update({ branch: b },
        { branch: b, text:'', errors:''}, { upsert : true });

      command = spawn('sh', ['-cx', [
        "cd " + localGitDir,
        "git checkout " + b,
        // "git pull",
        "cd " + localGitDir,
        "docker build -t lcdapp .",
        "docker-compose -p " + b + " stop",
        "docker-compose -p " + b + " up -d"
      ].join(' && ')], { env: {WEB_PORT: port}});

      logCommand(command, b);
    },

    stopStack: function(branch) {
      var b = branch['name'];
      var port = branch['port'];
      // console.log("stopping stack " + b + " port: " + port);

      Logs.update({ branch: b },
        { branch: b, text:'', errors:''}, { upsert : true });

      command = spawn('sh', ['-cx', [
        "cd " + localGitDir,
        "docker-compose -p " + b + " stop"
      ].join(' && ')], { env: {WEB_PORT: port}});

      logCommand(command, b);
    },

    getServerTime: function () {
      var _time = (new Date).toTimeString();
      return _time;
    },

    getBranches: function() {
      var allBranches = getRemoteBranches();
      var runningBranches = getRunningBranches();

      allBranches.forEach(function(val, i) {

        var dockerName = dockerNamify(val['name']);

        if (Object.keys(runningBranches).length === 0 || runningBranches[dockerName] == null) {
          val['running'] = false;
        } else {
          val['port'] = runningBranches[dockerName]['port']
          val['running'] = true;
        }
      });

      // console.log(allBranches);
      return allBranches;
    }

  });

  Meteor.startup(function () {
    console.log('server start');
  });
}
