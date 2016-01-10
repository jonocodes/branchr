if (Meteor.isClient) {

  Meteor.startup(function () {

    document.title = "Branchr ["+ conf.serviceName +"]";

    log.info("starting client");

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
      return conf.serviceName;
    },
    branches: function() {
      return Branches.find({});
    },
    log: function() {
      return Branches.find({branch:Session.get('currentBranch')});
    }
  });

  Template.branchrow.helpers({
    url: function(port) {
      var protocol = 'http';
      return protocol + '://' + host + ':' + port;
    },
    isWatching: function() {
      return this.watching !== undefined && this.watching;
    }
  });

  Template.registerHelper("objectToPairs",function(object){
    return _.map(object, function(value, key) {
      return {
        key: key,
        value: value
      };
    });
  });

  Template.branchrow.events({
    'click button.start': function(event, template) {
      log.info('start ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
      Meteor.call('startStack', template.data, function(error, result) {
        if (error)
          log.error(error);
      });
    },
    'click button.stop': function(event, template) {
      log.info('stop ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
      Meteor.call('stopStack', template.data);
    },
    'click button.log': function(event, template) {
      log.info('toggle log view ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
    },
    'change input.watchbox': function(event, template) {
      log.info('toggle watch ' + template.data['branch']);
      Meteor.call('toggleWatch', template.data['branch'], event.target.checked);
    }
  });

}
