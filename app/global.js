// get globals from config
conf = Meteor.settings.public;

if (conf.serviceName === undefined)    // or fail?
  conf.serviceName = "unknown app";

if (conf.localGitDir === undefined)
  conf.localGitDir = "/git";

host = 'localhost'; // docker host
if (conf.host)
  host = conf.host

// TODO: toggle listening local or remote (default)

Logger.setLevel('trace');
log = new Logger('app');

// setup database
Branches = new Mongo.Collection("branches");
