
// TODO: toggle listening local or remote (default)

Logger.setLevel('trace');
log = new Logger('app');

// setup database
Branches = new Mongo.Collection("branches");

// get globals from config
conf = Meteor.settings.public;

if (conf.serviceName === undefined) {
  log.error("serviceName required");
  process.exit(1);
}

if (conf.localGitDir === undefined) {
  log.error("localGitDir required");
  process.exit(1);
}

if (conf.repoLocallity === undefined || conf.repoLocallity != "remote")
  conf.repoLocallity = "local";

host = 'localhost'; // docker host
if (conf.host)
  host = conf.host
