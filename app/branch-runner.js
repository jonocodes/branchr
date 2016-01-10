
var serviceName = Meteor.settings.public.serviceName;
var localGitDir = Meteor.settings.public.localGitDir;
var host = 'localhost';
// TODO: toggle listening local or remote (default)

Branches = new Mongo.Collection("branches");

Logger.setLevel('trace');
var log = new Logger('app');

if (Meteor.isClient) {

  Meteor.startup(function () {

    document.title = "Branchr ["+ serviceName +"]";

    log.info("starting client");

    setInterval(function () {
      Meteor.call("getServerTime", function (error, result) {
        Session.set("time", result);
      });
    }, 2000);

  });

  Template.body.helpers({
    time: function() {
      return Session.get("time");
    },
    serviceName: function() {
      return serviceName;
    },
    branches: function() {
      return Branches.find({});
    },
    log: function() {
      return Branches.find({branch:Session.get('currentBranch')});
    }
  });

  Template.branchrow.helpers({
    url: function() {
      var protocol = 'http';
      return protocol + '://' + host + ':' + this.port;
    },
    isWatching: function() {
      return this.watching !== undefined && this.watching;
    }
  });

  Template.branchrow.events({
    'click button.start': function(event, template) {
      log.info('start ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
      Meteor.call('startStack', template.data, function(error, result) {
        if (error)
          log.error(error);
      });
    },
    'click button.stop': function(event, template) {
      log.info('stop ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
      Meteor.call('stopStack', template.data);
    },
    'click button.log': function(event, template) {
      log.info('toggle log view ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
    },
    'change input.watchbox': function(event, template) {
      log.info('toggle watch ' + template.data['branch']);
      Meteor.call('toggleWatch', template.data['branch'], event.target.checked);
    }
  });

}

if (Meteor.isServer) {

  var Future = Npm.require('fibers/future');
  const spawn = Npm.require('child_process').spawn;

  var baseImage = dockerNamify(serviceName);

  // const exec = Npm.require('child_process').exec;
  // var Git = Meteor.npmRequire('nodegit');    // slow startup

  // function getRemoteBranchesGit() {  // TODO: get nexted then's to work
  //   // log.info('getRemoteBranchesGit');
  //   Git.Repository.open(localGitDir + "/.git").then(function(repository) {
  //     log.info(repository);
  //
  //     Git.Branch.iteratorNew(repository, GIT_BRANCH_LOCAL).then(function(branchIterator) {
  //       log.info('branchIterator : ' + branchIterator);
  //
  //       for(let value of branchIterator){
  //         log.info("I " + value)
  //       }
  //     });
  //
  //   });
  // }


  function checkForUpdate(branchName, branchInDb) {
    var future = new Future();

    log.info('checking for updates in ' + branchName);
    command = spawn('sh', ['-c',
    "git --git-dir=" + localGitDir + "/.git pull"]);

    command.stdout.on('data', function (data) {
      future.return(data);
    });

    command.stderr.on('data', function (data) {
      log.error("stderr: " + data);
    });

    future.wait();

    var lastCommit = getLastCommit(branchName);
    var runningCommit = branchInDb['lastCommit'];

    if (lastCommit['checksum'] !== runningCommit['checksum']) {
      log.info('git was updated for ' + branchName);

      // TODO: queue up instead of calling immediately?

      Meteor.call('startStack', branchInDb);
    }

    return false;
  }

  function getLastCommit(branchName) {

    var future = new Future();

    command = spawn('sh', ['-c',
    "git --git-dir=" + localGitDir + "/.git log origin/" + branchName + " -1 --format='%h%n%an%n%cr%n%s%n%ae'"]);

    command.stdout.on('data', function (data) {
      var commit = (''+data).trim().split("\n");

      future.return({
        checksum: commit[0],
        author: commit[1],
        date: commit[2],
        title: commit[3],
        email: commit[4],
        gravatar: "https://www.gravatar.com/avatar/" + CryptoJS.MD5(commit[4]).toString()
      });
    });

    command.stderr.on('data', function(data) {
      log.error("stderr: " + data);
    });


    return future.wait();
  }

  function getRemoteBranches() {

    var future = new Future();

    command = spawn('sh', ['-c',
    "git --git-dir=" + localGitDir + "/.git branch --remote|grep -v origin/HEAD|sed 's/[^/]*\\///'"]);

    command.stdout.on('data', function (data) {
      var branchNames = (''+data).trim().split("\n");

      var resultList = [];
      branchNames.forEach(function(val, i) {
        resultAssoc = {};
        resultAssoc['branch'] = val;
        resultList.push(resultAssoc);
      });

      future.return(resultList); // TODO: append since this is a stream?
    });

    command.stderr.on('data', function (data) {
      log.error("stderr: " + data);
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
        resultAssoc['branch'] = exploded[0];
        resultAssoc['port'] = exploded[1];
        // resultAssoc['uptime'] = exploded[2];
        resultList[exploded[0]] = resultAssoc;
      });
      future.return(resultList);
    });

    command.stderr.on('data', function (data) {
      log.error("stderr: " + data);
    });

    command.on('close', function(code) {
      if (!future.isResolved()) {
        future.return({});
      }
    });

    return future.wait();
  }

  function getAllBranches() {
    var allBranches = getRemoteBranches();
    var runningBranches = getRunningBranches();

    allBranches.forEach(function(val, i) {

      var dockerName = dockerNamify(val['branch']);

      if (Object.keys(runningBranches).length === 0 || runningBranches[dockerName] == null) {
        val['running'] = false;
      } else {
        val['port'] = runningBranches[dockerName]['port']
        val['running'] = true;
      }
    });

    log.info("branch count: " + allBranches.length);
    return allBranches;
  }

  function getUnusedPort() {
    // TODO: check if port is used
    return Math.floor(Math.random() * (7000 - 5000)) + 5000;
  }

  function dockerNamify(name) {
    // turn into a name that is a valid for a docker container
    return name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  }

  function logCommand(command, b, actionStatus, successStatus) {

    Branches.update({ branch: b },{$set: { log:'' }});

    command.stdout.on('data', Meteor.bindEnvironment( function(data) {
      log.debug(data.toString());
      var body = Branches.findOne({branch:b});
      Branches.update({ branch: b }, { $set :
        { log: body['log'] + data, status: actionStatus}
      });
    }));

    command.stderr.on('data', Meteor.bindEnvironment( function(data) {
      log.error(data.toString());
      var body = Branches.findOne({branch:b});
      Branches.update({ branch: b }, { $set :
        { log: body['log'] + data, status: actionStatus}
      });
    }));

    command.on('close', Meteor.bindEnvironment( function(code) {
      var body = Branches.findOne({branch:b});
      Branches.update({ branch: b }, { $set :
        { log: body['log'] + "\n= DONE =", status: successStatus}
      });
      // TODO: force refresh here instead of waiting
    }));
  }

  Meteor.methods({

    startStack: function(branch) {
      // startStack(branch);
      var b = branch['branch'];
      var port = getUnusedPort();
      var image = baseImage + ':' + b;

      log.info("starting stack " + b + " port: " + port);

      var envs = {
        WEB_PORT: port,
        // HTTP_PORT: port,
        IMAGE: image
      }

      command = spawn('sh', ['-cx', [
        "cd " + localGitDir,
        "git checkout " + b,       // TODO: handle error code returns
        "git pull",
        "cd " + localGitDir,
        "docker build -t $IMAGE .",
        "docker-compose -p " + b + " stop",
        "docker-compose -p " + b + " up -d"
      ].join(' && ')], { env: envs });

      logCommand(command, b, "starting...", "running");
    },

    stopStack: function(branch) {
      var b = branch['branch'];
      var port = branch['port'];

      command = spawn('sh', ['-cx', [
        "cd " + localGitDir,
        "docker-compose -p " + b + " stop"
      ].join(' && ')], { env: {WEB_PORT: port}});

      logCommand(command, b, "stopping...", "stopped");
    },

    toggleWatch: function(branchName, watch) {
      Branches.update({ branch: branchName }, { $set :
        { watching : watch }
      });
    },

    getServerTime: function () {
      return (new Date).toTimeString();
    },

  });

  Meteor.startup(function () {
    log.info('server start');

    // Branches.remove({});

    Meteor.bindEnvironment( function() {
      var branches = getAllBranches();

      branches.forEach(function(val, i) {

        Branches.update({ branch: val['branch'] }, { $set:{
          branch: val['branch'],
          lastCommit: getLastCommit(val['branch']),  // might not be same as running?
          log: ''   // TODO: why no work?
        }},
        { upsert : true });

      });
    });

    setInterval(Meteor.bindEnvironment( function() {

      // listen for new/old patches
      var branches = getAllBranches();

      branches.forEach(function(val, i) {

        Branches.update({ branch: val['branch'] }, { $set:{
          running: val['running'],
          port: val['port'],
          // lastCommit: getLastCommit(val['name'])  // might not be same as running?
        //  status: status
        }},
        { upsert : true });

      });

      // listen to existing branches for changes
      var watchBranches = Branches.find({ watching: true });

      // TODO: implement queue here so the same build does not fall over itself
      watchBranches.forEach(function(val, i) {
        checkForUpdate(val['branch'], val);
      });

    }), 10000);

  });
}
