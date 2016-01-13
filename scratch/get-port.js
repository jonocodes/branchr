
var net = require('net');
// var Future = require('fibers/future');

function checkport(port) {

  console.log('checking port ' + port);

  // var future = new Future();
  var c = net.connect(port, function () {
    c.destroy();
    // future.return(true);
    console.log('connected');
  });

  c.destroy();


  // return future.wait();
  // c.on('error', function () {
  //   cb(null, start)
  // })
}

// https://github.com/mikeal/getport
function openport (start, end, cb) {
  if (!cb) {
    if (!end) {
      cb = start
      start = 2000
      end = 60000
    } else {
      cb = end
      end = 60000
    }
  }
  if (start >= end) return cb(new Error('out of ports :('))

  var c = net.connect(start, function () {
    c.destroy()
    openport(start+1, end, cb)
  })
  c.on('error', function () {
    cb(null, start)
  })
}

function openport2 (port, cb) {
  var c = net.connect(port, function () {
    c.destroy()
  })
  c.on('error', function () {
    throw('error');
    // cb(null, port)
  })
}

https://gist.github.com/timoxley/1689041
var isPortTaken = function(port, fn) {
  var net = require('net')
  var tester = net.createServer()
  .once('error', function (err) {
    if (err.code != 'EADDRINUSE') return fn(err)
    fn(null, true)
  })
  .once('listening', function() {
    tester.once('close', function() { fn(null, false) })
    .close()
  })
  .listen(port)
}

// checkport(4000);

// openport(8080, function (e, p) {
//   if (e) console.log(e);
//   console.log("opened " + p);
//
//   openport2(8080, function (e, p) {
//     if (e) console.log(e);
//     console.log("opened2 " + p);
//   });
// });

// isPortTaken(5000, function(port, ))

https://github.com/toksea/node-random-port
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


const minPort = 5000;
const maxPort = 8080;

var randPort = function(cb) {

  var port = Math.floor(Math.random() * (maxPort - minPort)) + minPort;

  var server = net.createServer();
  server.listen(port, function (err) {
      server.once('close', function () {
          cb(port);
      });
      server.close();
  });
  server.on('error', function (err) {
      randPort(cb);
  });
}

random_port(console.log); // default will return a port from 15000 to 15099

random_port({from: 20000}, console.log);

random_port({from: 20000, range: 10}, console.log);

randPort(console.log);
