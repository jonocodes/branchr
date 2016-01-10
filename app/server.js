if (Meteor.isServer) {

  var Future = Npm.require('fibers/future');
  const spawn = Npm.require('child_process').spawn;

  var baseImage = dockerNamify(conf.serviceName);

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
    "git --git-dir=" + conf.localGitDir + "/.git pull"]);

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
    "git --git-dir=" + conf.localGitDir + "/.git log origin/" + branchName + " -1 --format='%h%n%an%n%cr%n%s%n%ae'"]);

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
    "git --git-dir=" + conf.localGitDir + "/.git branch --remote|grep -v origin/HEAD|sed 's/[^/]*\\///'"]);

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

    // command = spawn('sh', ['-c',
    // "docker ps --format '{{.Names}}\t{{.Ports}}' | grep _web_1 | sed 's/_web_1//' | sed 's/0.0.0.0://' | sed 's/->.*//' | sed 's/" + baseImage +"//'"]);

    command = spawn('sh', ['-c',
    "docker ps --filter 'name=" + baseImage + "' --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'"]);

    // testappdevelop_web_1	Up 12 minutes	0.0.0.0:5005->5000/tcp, 0.0.0.0:5010->6000/tcp
    // testappdevelop_redis_1	Up 12 minutes	0.0.0.0:6379->6379/tcp

    command.stdout.on('data', function (data) {

      var containers = (''+data).trim().split('\n');

      var branches = {};
      containers.forEach(function(line, i) {

        // log.debug("running line", line);

        var d = line.split('\t');

        var split_name = d[0].substring(baseImage.length, d[0].length-2).split('_');

        // log.debug('split_name', split_name);

        var branch = split_name[0];
        var service = split_name[1];
        var uptime = d[1];

        var ports = [];

        if (branches[branch] == undefined)
          branches[branch] = { uptime: uptime, stack: {} };

        d[2].split(',').forEach(function(p, i) {
          // log.debug('port', p.replace(/^[^:]+:(\d+).*$/, "$1"));
          ports.push(p.replace(/^[^:]+:(\d+).*$/, "$1"));
        });

        // log.debug('ports', ports);

        branches[branch]['stack'][service] = ports;

      });
      future.return(branches);

      log.debug('branches', branches);

      // console.log(branches['develop']['stack']['web']);

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
    // var runningBranches = getRunningBranches();
    //
    // allBranches.forEach(function(val, i) {
    //
    //   var dockerName = dockerNamify(val['branch']);
    //
    //   if (Object.keys(runningBranches).length === 0 || runningBranches[dockerName] == null) {
    //     val['running'] = false;
    //   } else {
    //     val['stack'] = runningBranches[dockerName]['stack'];
    //     val['uptime'] = runningBranches[dockerName]['uptime'];
    //     val['running'] = true;
    //   }
    // });

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
      // log.debug(data.toString());
      var body = Branches.findOne({branch:b});
      Branches.update({ branch: b }, { $set :
        { log: body['log'] + data, status: actionStatus}
      });
    }));

    command.stderr.on('data', Meteor.bindEnvironment( function(data) {
      // log.error(data.toString());
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
      // var port = getUnusedPort();
      var image = baseImage + ':' + b;

      var stack = {};

      var envs = {
        // WEB_PORT: getUnusedPort(),
        // // HTTP_PORT: port,
        // PORT_HTTP_REDIS: getUnusedPort(),
        IMAGE: image
      }

      for (var service in conf.requiredPorts) {
        stack[service] = {};
        conf.requiredPorts[service].forEach(function(name, i) {
          stack[service][name] = getUnusedPort();
          envs[name] = stack[service][name];
        });
      }

      log.info("starting stack " + b, stack);

      command = spawn('sh', ['-cx', [
        "cd " + conf.localGitDir,
        "git checkout " + b,       // TODO: handle error code returns
        "git pull",
        "cd " + conf.localGitDir,
        "docker build -t $IMAGE .",
        "docker-compose -f " + conf.dockerComposeFile + " -p " + baseImage + b + " stop",
        "docker-compose -f " + conf.dockerComposeFile + " -p " + baseImage + b + " up -d"
      ].join(' && ')], { env: envs });

      logCommand(command, b, "starting...", "running");

      // update db

      Branches.update({ branch: b }, { $set:{
        running: true,
        stack: stack
        // uptime: val['uptime']
        // lastCommit: getLastCommit(val['name'])  // might not be same as running?
      }});

      // check docker to see if it is indeed running, update uptime
    },

    stopStack: function(branch) {
      var b = branch['branch'];
      var stack = branch['stack'];

      var envs = {
        IMAGE: baseImage + ':' + b
      }

      for (var service in stack) {
        for (var name in stack[service]) {
          var port = stack[service][name];
          envs[name] = port;
        }
      }

      log.debug('envs', envs);

      command = spawn('sh', ['-cx', [
        "cd " + conf.localGitDir,
        "docker-compose -f " + conf.dockerComposeFile + " -p " + baseImage + b + " stop"
      ].join(' && ')], { env: envs });

      logCommand(command, b, "stopping...", "stopped");

      Branches.update({ branch: b }, { $set:{
        running: false
      }});
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

      // listen for new/old branches
      var branches = getAllBranches();

      branches.forEach(function(val, i) {

        // Branches.update({ branch: val['branch'] }, { $set:{
        //   running: val['running'],
        //   // stack: val['stack'],
        //   // uptime: val['uptime']
        //   // lastCommit: getLastCommit(val['name'])  // might not be same as running?
        // //  status: status
        // }},
        // { upsert : true });

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
