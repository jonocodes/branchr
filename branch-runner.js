
var serviceName = Meteor.settings.public.serviceName;
var localGitDir = Meteor.settings.public.localGitDir;
var host = 'localhost';

Branches = new Mongo.Collection("branches");

if (Meteor.isClient) {

  Meteor.startup(function () {

    document.title = "Branchr ["+ serviceName +"]";

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
    }
  });

  Template.branchrow.events({
    'click button.start': function(event, template) {
      console.log('start ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
      Meteor.call('startStack', template.data, function(error, result) {
        if (error) {
          console.log(error);
        }
        // else {
        //   console.log('response: ', result);
        // }
      });
    },
    'click button.stop': function(event, template) {
      console.log('stop ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
      Meteor.call('stopStack', template.data, function(error, result) {
        if (error) {
          console.log(error);
        }
      });
    },
    'click button.log': function(event, template) {
      console.log('toggle log view ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
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

      future.return(resultList); // TODO: append since this is a stream?
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

  function getAllBranches() {
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

  function getUnusedPort() {
    // TODO: check if port is used
    return Math.floor(Math.random() * (7000 - 5000)) + 5000;
  }

  function dockerNamify(name) {
    // turn into a name that is a valid for a docker container
    return name.replace(/[^a-zA-Z0-9_]/, "");
  }

  function logCommand(command, b, actionStatus, successStatus) {

    Branches.update({ branch: b },{$set: { log:'' }});

    command.stdout.on('data', Meteor.bindEnvironment( function(data) {
      // console.log(''+data);
      var body = Branches.findOne({branch:b});
      // body['log'] = body['log'] + data;
      // Branches.update({ branch: b }, body); // TODO: simplify with $set
      Branches.update({ branch: b }, { $set :
        { log: body['log'] + data, status: actionStatus}
      });
    }));

    command.stderr.on('data', Meteor.bindEnvironment( function(data) {
      // console.log('err: '+data);
      var body = Branches.findOne({branch:b});
      // body['errors'] = body['errors'] + data;
      // body['log'] = body['log'] + String(data);
      // Branches.update({ branch: b }, body);
      Branches.update({ branch: b }, { $set :
        { log: body['log'] + data, status: actionStatus}
      });
    }));

    command.on('close', Meteor.bindEnvironment( function(code) {
      var body = Branches.findOne({branch:b});
      // body['log'] = body['log'] + "\n= DONE =";
      Branches.update({ branch: b }, { $set :
        { log: body['log'] + "\n= DONE =", status: successStatus}
      });
      // TODO: force refresh here instead of waiting
    }));
  }

  Meteor.methods({

    startStack: function(branch) {
      var b = branch['branch'];
      var port = getUnusedPort();

      console.log("starting stack " + b + " port: " + port);

      command = spawn('sh', ['-cx', [
        "cd " + localGitDir,
        "git checkout " + b,
        // "git pull",
        "cd " + localGitDir,
        "docker build -t lcdapp .",
        "docker-compose -p " + b + " stop",
        "docker-compose -p " + b + " up -d"
      ].join(' && ')], { env: {WEB_PORT: port}});

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

    getServerTime: function () {
      return (new Date).toTimeString();
    },

  });

  Meteor.startup(function () {
    console.log('server start');

    // TODO: clear log only on server start

    setInterval(Meteor.bindEnvironment(function () {
      var branches = getAllBranches();

      branches.forEach(function(val, i) {

        var status = 'not running';
        if (val['running'])
          status = 'running';

        Branches.update({ branch: val['name'] }, { $set:{
          branch: val['name'],
          running: val['running'],
          port: val['port'],
        //  status: status
        }},
        { upsert : true });

      });

    }), 5000);

  });
}
