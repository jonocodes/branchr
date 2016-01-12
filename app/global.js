// get globals from config
conf = Meteor.settings.public;

host = 'localhost'; // docker host
if (conf.host)
  host = conf.host

// TODO: toggle listening local or remote (default)

Logger.setLevel('trace');
log = new Logger('app');

// setup database
Branches = new Mongo.Collection("branches");
