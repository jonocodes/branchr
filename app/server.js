if (Meteor.isServer) {

  var Future = Npm.require('fibers/future');
  const spawn = Npm.require('child_process').spawn;

  const baseImage = dockerNamify(conf.serviceName);
  const dockerCompose = "docker-compose -f " + conf.dockerComposeFile;

  const minPort = 5000;
  const maxPort = 7000;


  var net = Npm.require('net');

  var random_port = function() {
    var cb,
        opts = {};

    if (arguments.length == 0) {
        throw "no callback";
    }
    else if (arguments.length == 1) {
        cb = arguments[0];
    }
    else {
        opts = arguments[0];
        cb = arguments[arguments.length - 1];
    }

    if (typeof cb != 'function') {
        throw "callback is not a function";
    }

    if (typeof opts != 'object') {
        throw "options is not a object";
    }

    var from = opts.from > 0 ? opts.from : 15000,
        range = opts.range > 0 ? opts.range : 100,
        port = from + ~~(Math.random() * range);

    var server = net.createServer();
    server.listen(port, function (err) {
        server.once('close', function () {
            cb(port);
        });
        server.close();
    });
    server.on('error', function (err) {
        random_port(opts, cb);
    });
  }

  function getUnusedPort() {
    // TODO: check if port is used
    // let port = Math.floor(Math.random() * (maxPort - minPort)) + minPort;
    // return port;

    var future = new Future();
    random_port({from: maxPort, range: 1000}, function(port){
      // TODO: limit number of tries
      future.return(port)
    });
    return future.wait();
  }

  function dockerNamify(name) {
    // turn into a name that is a valid for a docker container
    return name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  }

  // helper function to select a branch
  function bs(name) {
    return { branch: name, app: conf.serviceName};
  }

  function checkForUpdate(branchName, branchInDb) {
    var future = new Future();

    log.info('checking for updates in ' + branchName);
    command = spawn('sh', ['-cx',
    "git --git-dir=" + conf.localGitDir + "/.git pull"]);

    command.stdout.on('data', function (data) {
      future.return(data);
    });

    command.stderr.on('data', function (data) {
      log.error("stderr: " + data);
    });

    future.wait();

    let lastCommit = getLastCommit(branchName);
    let runningCommit = branchInDb['lastCommit'];

    if (lastCommit['checksum'] !== runningCommit['checksum']) {
      log.info('git was updated for ' + branchName);

      // TODO: queue up instead of calling immediately?

      Meteor.call('startStack', branchInDb, "automatically");
    }

    return false;
  }

  function getLastCommit(branchName) {

    var future = new Future();

    command = spawn('sh', ['-c',
    "git --git-dir=" + conf.localGitDir + "/.git log origin/" + branchName + " -1 --format='%h%n%an%n%cr%n%s%n%ae%n%ai'"]);

    command.stdout.on('data', function (data) {
      let commit = (''+data).trim().split("\n");

      future.return({
        checksum: commit[0],
        author: commit[1],
        dateRelative: commit[2],
        title: commit[3],
        email: commit[4],
        date: commit[5],
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
      let branchNames = (''+data).trim().split("\n");

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
    "docker ps --filter 'name=" + baseImage + "' --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'"]);

    command.stdout.on('data', function (data) {

      let containers = (''+data).trim().split('\n');

      let branches = {};
      containers.forEach(function(line, i) {

        let d = line.split('\t');
        let split_name = d[0].substring(baseImage.length, d[0].length-2).split('_');
        let branch = split_name[0];
        let service = split_name[1];
        let uptime = d[1];
        let ports = [];

        if (branches[branch] == undefined)
          branches[branch] = { uptime: uptime, stack: {} };

        d[2].split(',').forEach(function(p, i) {
          ports.push(p.replace(/^[^:]+:(\d+).*$/, "$1"));
        });

        branches[branch]['stack'][service] = ports;

      });
      future.return(branches);
    });

    command.stderr.on('data', function (data) {
      log.error("stderr: " + data);
    });

    command.on('close', function(code) {
      if (!future.isResolved())
        future.return({});
    });

    return future.wait();
  }

  function getAllBranches() {
    let allBranches = getRemoteBranches();
    let runningBranches = getRunningBranches();

    log.info("remote branches: " + allBranches.length +
      "  running branches: " + getRunningBranches.length);

    allBranches.forEach(function(val, i) {

      let dockerName = dockerNamify(val['branch']);

      if (Object.keys(runningBranches).length === 0 || runningBranches[dockerName] == null) {
        val['running'] = false;
      } else {
        val['stack'] = runningBranches[dockerName]['stack'];
        val['uptime'] = runningBranches[dockerName]['uptime'];
        val['running'] = true;
      }
    });

    return allBranches;
  }

  function logCommand(command, br, actionStatus, closeCallback) {

    Branches.update( br, {$set: { log:'' }});

    command.stdout.on('data', Meteor.bindEnvironment( function(data) {
      Branches.update(br, { $set :
        { log: Branches.findOne(br)['log'] + data, status: actionStatus } });
    }));

    command.stderr.on('data', Meteor.bindEnvironment( function(data) {
      // log.error(data.toString());
      Branches.update(br, { $set :
        { log: Branches.findOne(br)['log'] + data, status: actionStatus } });
    }));

    command.on('close', Meteor.bindEnvironment( function(code) {
      closeCallback(code);
    }));
  }

  Meteor.methods({

    startStack: function(branch, triggered) {

      let b = branch['branch'];
      let br = bs(b);
      let image = baseImage + ':' + b;
      let stack = {};
      let envs = {  IMAGE: image  }

      for (let service in conf.requiredPorts) {
        stack[service] = {};
        conf.requiredPorts[service].forEach(function(name, i) {
          stack[service][name] = getUnusedPort();
          envs[name] = stack[service][name];
        });
      }

      log.info("starting stack " + b, stack);

      var command = spawn('sh', ['-cx', [
        // "ssh -T git@github.com", // ssh-agent -l
        "cd " + conf.localGitDir,
        "git checkout " + b,       // TODO: handle error code returns
        // "git pull",       // TODO: only do if monitoring remote is specified
        "cd " + conf.dockerBuildDir,
        conf.dockerBuildCmd,
        dockerCompose + " -p " + baseImage + b + " stop",
        dockerCompose + " -p " + baseImage + b + " up -d"
      ].join(' && ')], { env: envs });

      // TODO: add spinner at bottom like teamcity

      logCommand(command, br, "starting...", function(returnCode) {
        if (returnCode == 0)
          Branches.update(br, { $set : {
            log: Branches.findOne(br)['log'] + "\n= DONE =",
            stack: stack,
            status: "running",
            running: true, // TODO: check running in docker instead
            triggered: triggered, // TODO: set this at start, not finish
            time: (new Date).toTimeString()
          }});
        else
          Branches.update(br, { $set : {
            log: Branches.findOne(br)['log'] + "\n= ERROR =",
            status: "failed",
            running: false, // TODO: check running in docker instead
          }});
      });

    },

    stopStack: function(branch) {
      let b = branch['branch'];
      let br = bs(b);
      let stack = branch['stack'];

      let envs = {
        IMAGE: baseImage + ':' + b
      }

      log.info('stop stack', b, stack);

      for (let service in stack) {
        for (let name in stack[service]) {
          envs[name] = stack[service][name];
        }
      }

      // log.debug('envs', envs);

      command = spawn('sh', ['-cx', [
        "cd " + conf.localGitDir,
        dockerCompose + " -p " + baseImage + b + " stop"
      ].join(' && ')], { env: envs });

      logCommand(command, br, "stopping...", function() {
        Branches.update(br, { $set : {
          log: Branches.findOne(br)['log'] + "\n= DONE =",
          stack: {},
          uptime: null,
          status: 'stopped',
          running: false, // TODO: check running in docker instead
          triggered: 'manually', //null,
          time: (new Date).toTimeString()
        }});
      });
    },

    toggleWatch: function(branchName, watch) {
      Branches.update({ branch: branchName, app: conf.serviceName }, { $set :
        { watching : watch }
      });
    },

    getServerTime: function () {
      return (new Date).toTimeString();
    },

  });

  Meteor.startup(function () {
    log.info('server start');

    // Branches.remove({}); // clears the DB

    // first pass on DB at startup for cleaning purposes?
    // is this ever getting called?
    Meteor.bindEnvironment( function() {
      let branches = getAllBranches();

      branches.forEach(function(val, i) {

        Branches.update({ branch: val['branch'], app: conf.serviceName }, { $set:{
          branch: val['branch'],
          lastCommit: getLastCommit(val['branch']),  // might not be same as running?
          log: ''   // TODO: why no work?
        }},
        { upsert : true });

      });

    });

    setInterval(Meteor.bindEnvironment( function() {

      // listen for new/old branches
      let branches = getAllBranches();

      branches.forEach(function(val, i) {
        Branches.update({ branch: val['branch'], app: conf.serviceName }, { $set:{
          running: val['running'],
          uptime: val['uptime'],
          lastCommit: getLastCommit(val['branch'])  // might not be same as running?
        }},
        { upsert : true });

      });

      // listen to existing branches for changes
      let watchBranches = Branches.find({ watching: true, app: conf.serviceName });

      // TODO: implement queue here so the same build does not fall over itself
      watchBranches.forEach(function(val, i) {
        checkForUpdate(val['branch'], val);
      });

    }), 10000);

  });
}
