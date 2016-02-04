if (Meteor.isServer) {

  var Future = Npm.require('fibers/future');
  const spawn = Npm.require('child_process').spawn;

  const baseImage = dockerNamify(conf.serviceName);
  const dockerCompose = "docker-compose -f " + conf.dockerComposeFile;

  const minPort = 5000;
  const maxPort = 7000;

  const pollMilliseconds = 10 * 1000;

  const pullCommand = (conf.repoLocallity == "local") ? ":"  : "git pull";


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
    return { branch: name, app: conf.serviceName };
  }

  function checkForUpdate(branchName, branchInDb) {
    var future = new Future();

    log.info('checking for updates in ' + branchName);

    let command = spawn('bash', ['-c', [
      "cd " + conf.localGitDir,
      "git checkout " + branchName,
      pullCommand].join(' && ')]);

    let result = null;

    command.stdout.on('data', function (data) {
      result = data.toString()
    });

    command.stderr.on('data', function (data) {
      // log.error("stderr: " + data);
    });

    command.on('close', function(code) {
      future.return(result);
    });

    future.wait();

    let lastChecksum = getLastCommit(branchName)['checksum'];
    let pendingChecksum = branchInDb['pendingChecksum'];
    let runningCommit = branchInDb['runningCommit'];

    let runningChecksum = null;

    if (runningCommit != null)
      runningChecksum = runningCommit['checksum'];

    // only run if it's checksum in not already running or pending

    if (//runningCommit == null ||
      lastChecksum !== runningChecksum &&
      lastChecksum !== pendingChecksum) {

      log.debug('git was updated for ' + branchName);
      log.debug('runningCommit', runningCommit);
      log.debug('lastChecksum', lastChecksum);

      // TODO: queue up instead of calling immediately?

      Meteor.call('startStack', branchInDb, "automatically");
    }

    return false;
  }

  function parseCommit(logEntry) {

    let lines = logEntry.split('\n');

    result = {};

    for (let l in lines) {
      let arr = lines[l].split(/ (.+)?/);
      result[arr[0]] = arr[1];
    }

    result['avatar'] = 'https://www.gravatar.com/avatar/' + CryptoJS.MD5(result['email']).toString();

    return result;
  }

  function getLastCommit(branchName) {

    var future = new Future();

    let command = spawn('bash', ['-c',
      "cd " + conf.localGitDir + " && " +
      pullCommand + " && " +
      "git log origin/" + branchName + " -1 --format='checksum %h%nauthor %an%ndateRelative %cr%nmessage %s%nemail %ae%ndate %ai'"]);

    let result = null;

    command.stdout.on('data', function(data) {
      result = parseCommit(data.toString().trim());
    });

    command.stderr.on('data', function(data) {
      log.error("stderr: " + data);
    });

    command.on('close', function(code) {
      future.return(result);
    });

    return future.wait();
  }

  function getRemoteBranches() {

    var future = new Future();

    let command = spawn('bash', ['-c',
      "cd " + conf.localGitDir + " && " +
      "git branch --remote|grep -v origin/HEAD|sed 's/[^/]*\\///'"]);

    let resultList = [];

    command.stdout.on('data', function(data) {
      let branchNames = data.toString().trim().split("\n");

      for (let i in branchNames) {
        resultAssoc = {};
        resultAssoc['branch'] = branchNames[i];
        resultList.push(resultAssoc);
      }

    });

    command.stderr.on('data', function(data) {
      log.error("stderr: " + data);
    });

    command.on('close', function(code) {
      future.return(resultList);
    });

    return future.wait();
  }

  function getRunningBranches() {
    var future = new Future();

    let command = spawn('bash', ['-c',
      "docker ps --filter 'name=" + baseImage + "' --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'"]);

    let branches = {};

    command.stdout.on('data', function (data) {

      let containers = data.toString().trim().split('\n');

      for (let i in containers) {

        let d = containers[i].split('\t');
        let split_name = d[0].substring(baseImage.length, d[0].length-2).split('_');
        let branch = split_name[0];
        let service = split_name[1];
        let uptime = d[1];
        let ports = [];

        if (branches[branch] == undefined)
          branches[branch] = { uptime: uptime, stack: {} };

        let portList = d[2].split(',');

        for (let port in portList)
          ports.push(portList[port].replace(/^[^:]+:(\d+).*$/, "$1"));

        branches[branch]['stack'][service] = ports;
      }
    });

    command.stderr.on('data', function (data) {
      log.error("stderr: " + data);
    });

    command.on('close', function(code) {
      future.return(branches);
    });

    return future.wait();
  }

  function getAllBranches() {
    let allBranches = getRemoteBranches();
    let runningBranches = getRunningBranches();
    let watchBranches = Branches.find(
      { watching: true, app: conf.serviceName }).fetch();

    log.info("Branches  remote: " + allBranches.length +
      "  running: " + Object.keys(runningBranches).length +
      "  watched: " + Object.keys(watchBranches).length);

    for (let i in allBranches) {
      let dockerName = dockerNamify(allBranches[i]['branch']);

      if (Object.keys(runningBranches).length === 0 || runningBranches[dockerName] == null) {
        allBranches[i]['running'] = false;
      } else {
        allBranches[i]['stack'] = runningBranches[dockerName]['stack'];
        allBranches[i]['uptime'] = runningBranches[dockerName]['uptime'];
        allBranches[i]['running'] = true;
      }
    }

    return allBranches;
  }

  function logCommand(command, br, actionStatus, pendingChecksum, closeCallback) {

    Branches.update( br, {$set: { log:'', pendingChecksum: pendingChecksum }});

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

  function listenForBranchesAndCommits() {

    // listen for new/old branches
    let branches = getAllBranches();

    for (let branch in branches) {
      let b = branches[branch]
      Branches.update( bs(b['branch']), { $set:{
        running: b['running'],
        uptime: b['uptime'],
        lastCommit: getLastCommit(b['branch'])  // might not be same as running?
      }},
      { upsert : true });
    }

    // listen to existing branches for changes
    let watchBranches = Branches.find(
      { watching: true, app: conf.serviceName }).fetch();

    // TODO: implement queue here so the same build does not fall over itself

    for (let i in watchBranches)
      checkForUpdate(watchBranches[i]['branch'], watchBranches[i]);

    setTimeout(Meteor.bindEnvironment(listenForBranchesAndCommits), pollMilliseconds);
  }

  Meteor.methods({

    startStack: function(branch, triggered) {

      let b = branch['branch'];
      let br = bs(b);
      let image = baseImage + ':' + b;
      let stack = {};
      let envs = conf.envs;
      envs['IMAGE'] = image;
      let runningCommit = getLastCommit(b);

      for (let service in conf.requiredPorts) {
        stack[service] = {};
        for (let i in conf.requiredPorts[service]) {
          let name = conf.requiredPorts[service][i];
          stack[service][name] = getUnusedPort();
          envs[name] = stack[service][name];
        }
      }

      log.info("starting stack", b);

      let command = spawn('bash', ['-cx', [
        "cd " + conf.localGitDir,
        "git checkout " + b,       // TODO: handle error code returns
        pullCommand,
        "cd " + conf.dockerBuildDir,
        conf.dockerBuildCmd,
        dockerCompose + " -p " + baseImage + b + " stop",
        dockerCompose + " -p " + baseImage + b + " up -d"
      ].join(' && ')], { env: envs });

      logCommand(command, br, "starting...", runningCommit.checksum, function(returnCode) {
        // is scope of br and runningCommit valid here?
        if (returnCode == 0)
          Branches.update(br, { $set : {
            log: Branches.findOne(br)['log'] + "\n= DONE =",
            stack: stack,
            status: "running",
            running: true, // TODO: check running in docker instead
            triggered: triggered, // TODO: set this at start, not finish
            time: (new Date).toTimeString(),
            runningCommit: runningCommit,
            pendingChecksum: null
          }});
        else
          Branches.update(br, { $set : {
            log: Branches.findOne(br)['log'] + "\n= ERROR =",
            status: "failed",
            running: false, // TODO: check running in docker instead
            runningCommit: null,
            pendingChecksum: null
          }});
      });

    },

    stopStack: function(branch) {
      let b = branch['branch'];
      let br = bs(b);
      let stack = branch['stack'];
      let envs = conf.envs;
      envs['IMAGE'] = baseImage + ':' + b;

      log.info('stop stack', b);

      for (let service in stack) {
        for (let name in stack[service]) {
          envs[name] = stack[service][name];
        }
      }

      let command = spawn('bash', ['-cx', [
        "cd " + conf.localGitDir,
        dockerCompose + " -p " + baseImage + b + " stop"
      ].join(' && ')], { env: envs });

      logCommand(command, br, "stopping...", null, function() {
        Branches.update(br, { $set : {
          log: Branches.findOne(br)['log'] + "\n= DONE =",
          stack: {},
          uptime: null,
          status: 'stopped',
          running: false, // TODO: check running in docker instead
          triggered: 'manually',
          time: (new Date).toTimeString(),
          runningCommit: null,
          pendingChecksum: null
        }});
      });
    },

    toggleWatch: function(branchName, watch) {
      Branches.update( bs(branchName), { $set :
        { watching : watch }
      });
    },

    getServerTime: function () {
      return (new Date).toTimeString();
    },

  });

  Meteor.startup(function () {
    log.info('Brancher app', conf.serviceName);
    log.info('local git', conf.localGitDir);
    // TODO: print git remote location

    // Branches.remove({}); // clears the DB

    listenForBranchesAndCommits();

  });
}
