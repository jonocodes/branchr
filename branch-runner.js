Logs = new Mongo.Collection("logs");

if (Meteor.isClient) {

  Meteor.startup(function () {

    setInterval(function () {
      Meteor.call("getServerTime", function (error, result) {
        Session.set("time", result);
      });
    }, 2000);

    setInterval(function () {
      Meteor.call("getBranches", function(error, result) {
        Session.set("remoteBranches", result);
        console.log(Session.get("remoteBranches"));
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
      // console.log(Logs.find({}));
      // return "log goes here";
      return Logs.find({});
    }

  });

  Template.branch.events({
    'click button#start': function(event, template) {
      console.log('start ' + template.data['name']);
      Meteor.call('startStack', template.data, function(error, result) {
        if(error){
          console.log(error);
        } else {
          console.log('response: ', result);
        }
      });
    },
    'click button#stop': function(event, template) {
      console.log('stop ' + template.data['port']);
    }
  });

}

if (Meteor.isServer) {

  var Future = Npm.require('fibers/future');
  spawn = Npm.require('child_process').spawn;
  // var Git = Meteor.npmRequire('nodegit');    // slow startup

  // config
  var serviceName = 'Test App';
  // var baseDir = "/home/jono/files/"
  // var dockerfilesDir = baseDir + "/lcd-test-app";
  var localGitDir = '/home/jono/files/lcd-test-app';
  var dockerfilesDir = localGitDir;
  // end config

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

  function async(cb){
    Meteor.setTimeout(function () {
      cb(null, 'hello');
    }, 3000);
  }

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
      // console.log('running branches: ' + branches);

      var resultList = {};
      branches.forEach(function(val, i) {
        resultAssoc = {};
        var exploded = val.split('\t');
        resultAssoc['name'] = exploded[0];
        resultAssoc['port'] = exploded[1];
        resultList[exploded[0]] = resultAssoc;
      });
      // console.log(resultList);

      future.return(resultList);
    });

    command.stderr.on('data', function (data) {
      console.log("stderr: " + data);
    });

    return future.wait();
  }

  function getUnusedPort() {
    // TODO: check if port is used
    return Math.random() * (7000 - 5000) + 500;
  }

  Meteor.methods({

    startStack: function(branch) {
      console.log("starting stack " + branch['name'] + getUnusedPort());

      // var future = new Future();

      command = spawn('sh', ['-c',
      "ls && sleep 2 && ls -l && sleep 3 && la"]);

      // if (Logs.find({ branch: branch['name']}).count() == 0) {
      //   Logs.insert({ branch: branch['name'], text=''});
      // } else {
      //   Logs.update({ branch: branch['name']}, { $set : []  })
      // }

      Logs.update({ branch: branch['name'] },
        { branch: branch['name'], text:''}, { upsert : true });

      command.stdout.on('data', function (data) {
        console.log(''+data);

        Logs.update({ branch: branch['name'] },
          { branch: branch['name'], text: ''+data});  // TODO: concat

        // future.return(''+data);
      });

      command.stderr.on('data', function (data) {
        console.log("stderr: " + data);
      });

      // return future.wait();

      // var fut = new Future();
      // var bound_callback = Meteor.bindEnvironment(function (err, res) {
      //   if (err) {
      //     fut.throw(err);
      //   } else {
      //     fut.return(res)
      //   }
      // });
      // async(bound_callback);
      // fut.wait();
    },

    getServerTime: function () {
      var _time = (new Date).toTimeString();
      // console.log(_time);
      return _time;
    },

    getBranches: function() {
      var allBranches = getRemoteBranches();
      var runningBranches = getRunningBranches();

      allBranches.forEach(function(val, i){
        if (runningBranches[val['name']] != null) {
          val['port'] = runningBranches[val['name']]['port']
          val['running'] = true;
        } else {
          val['port'] = 11111;
          val['running'] = false;
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
