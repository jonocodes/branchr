if (Meteor.isClient) {

  Meteor.startup(function () {

    document.title = "Branchr ["+ conf.serviceName +"]";

    log.info("starting client");

    setInterval(function () {
      Meteor.call("getServerTime", function (error, result) {
        Session.set("time", result);
      });
    }, 2000);

    // setInterval(function() {
    //   if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
    //     // you're at the bottom of the page
    //     window.scrollTo(0,document.body.scrollHeight);
    //   }
    // }, 1000);

  });

  Template.body.helpers({
    time: function() {
      return Session.get("time");
    },
    serviceName: function() {
      return conf.serviceName;
    },
    branches: function() {
      return Branches.find({ app: conf.serviceName },
        {sort: { "lastCommit.date" : -1 }});
    },
    log: function() {
      return Branches.findOne({
        branch: Session.get('currentBranch'), app: conf.serviceName });
    }
  });

  Template.logarea.helpers({
    isWorking: function() {
      var status = (Branches.find({
        branch: Session.get('currentBranch'), app: conf.serviceName }).fetch())[0].status;
      return (status && status.indexOf('...') > -1);
    }
  });

  Template.branchrow.helpers({
    address: function(name, port) {
      var protocol = '';

      if (name.indexOf('PORT_HTTP_') == 0)
        protocol = 'http://';
      else if (name.indexOf('PORT_HTTPS_') == 0)
        protocol = 'https://';

      return protocol + host + ':' + port;
    },
    isLink: function(name) {
      return (name.indexOf('PORT_HTTP') == 0);
    },
    isLogging: function(branch) {
      return (Session.get('currentBranch') == branch);
    },
    isWorking: function(status) {
      return (status && status.indexOf('...') > -1);
    },
    isWatching: function() {
      return this.watching !== undefined && this.watching;
    },
    rowActive: function(branch) {
      if (Session.get('currentBranch') == branch)
        return { class: "active" };
    },
    prepMessage: function(message) {
      if (message.length > 45)
        return message.substring(0, 45) + "...";
      return message;
    }
  });

  Template.registerHelper("objectToPairs",function(object){
    return _.map(object, function(value, key) {
      return {  key: key,  value: value  };
    });
  });

  Template.branchrow.events({
    'click button.start': function(event, template) {
      log.info('start ' + template.data['branch']);
      Session.set('currentBranch', template.data['branch']);
      Meteor.call('startStack', template.data, "manually", function(error, result) {
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
      Session.set('currentBranch', template.data['branch']);
    },
    'click tr.branchrow': function(event, template) {
      Session.set('currentBranch', template.data['branch']);
    },
    'change input.watchbox': function(event, template) {
      log.info('toggle watch ' + template.data['branch']);
      Meteor.call('toggleWatch', template.data['branch'], event.target.checked);
    }
  });

}
