
const spawn = require('child_process').spawn;

var command = spawn('sh', ['-cx', [
  "ssh -T git@github.com"
].join(' && ')]);

command.stdout.on('data', function (data) {
  console.log(''+data);
});

command.stderr.on('data', function (data) {
  console.log(''+data);
});
