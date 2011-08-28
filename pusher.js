var Pipe = require('pusher-pipe'),
    redis = require('./redis');
    
var md = require("node-markdown").Markdown;

var pipe = Pipe.createClient({
  app_id: 30,
  key: '1383811ab2998cfe80ea',
  secret: '1514b53467d510d457a1',
  debug: false
});

pipe.connect();

var users = [];
var rooms = {};

pipe.sockets.on('event:rage', function(socket_id, data) {
  if (data.fsid) {
    if (data.fsid.length > 3) {
      var found = -1;
      
      for (var i = 0; i < users.length; i++) {
        if (users[i]) {
          if (users[i].fsid == data.fsid) {
            found = i;
          }
        }
      }
      
      if (found > -1) {
        redis.load_session(data.fsid, function(i) {
          return function(err, session) {
            if (!users[i].username) {
              users[i].username = users[i].socket_id;
            }
            
            if (session) {
              if (session.user) {
                if (users[i].username == users[i].socket_id) {
                  for (var j = 0; j < users[i].channels.length; j++) {
                    for (var k = 0; k < users[i].channels[j].users.length; k++) {
                      if (users[i].channels[j].users[k].socket_id == users[i].socket_id) {
                        users[i].channels[j].users[k] = users[i];
                      }
                    }
                    
                    pipe.channel(users[i].channels[j]).trigger('nickname', {old: users[i].socket_id, 'new': users[i].username});
                  }
                  
                  users[i].username = session.user.username;
                }
              }
            }
            
            users[i].online = true;
            
            pipe.socket(socket_id).trigger('rejoin', users[i].channels);
          };
        }(found));
      }
      
      if (found == -1) {
        redis.load_session(data.fsid, function(err, session) {
          if (err) {
            console.log(err);
          } else {
            var username = '';
            
            if (!session.user) {
              username = socket_id;
            } else {
              username = session.user.username;
            }
            
            var user = users.push({online: true, fsid: data.fsid, username: username, socket_id: socket_id, session: session, channels: []}) - 1;
            user = users[user];
            join_room(user, 'main');
          }
        });
      }
    }
  } else {
    
  }
});

pipe.sockets.on('event:join', function(socket_id, channel) {
  var channel = channel.channel;
  var fsid = channel.fsid;
  
  for (var i = 0; i < users.length; i++) {
    if (users[i].fsid == fsid) {
      join_room(users[i], channel);
    }
  }
});

pipe.sockets.on('event:message', function(socket_id, message) {
  var fsid = message.fsid;
  var channel = message.chan;
  var message = message.message;
  
  var found = null;
  
  for (var i = 0; i < users.length; i++) {
    if (users[i].fsid == fsid) {
      console.log('FOUND YOU');
      found = users[i];
    }
  }
  
  console.log('preparing to channel');
  if (found != null) {
    console.log('sending to channel ' + channel);
    
    var html = md(message, true);
    
    pipe.channel(channel).trigger('message', {message: html, nickname: found.username});
  }
});

pipe.sockets.on('close', function(socket_id) {
  for (var i = 0; i < users.length; i++) {
    if (users[i].socket_id == socket_id) {
      users[i].online = false;
      setTimeout(quit_user(users[i]), 3*1000);
    }
  }
});

function quit_user(user) {
  console.log('quit');
  console.log(user);
  return function() {
    if (user.online == false) {
      for (var j = 0; j < user.channels.length; j++) {
        pipe.channel(user.channels[j]).trigger('quit', user.username);
      }
    }
  };
}


function join_room(user, room) {
  console.log('USER IS JOINING YES');
  
  pipe.socket(user.socket_id).trigger('join', room);
  
  if (user.channels.indexOf(room) == -1) {
    pipe.channel(room).trigger('join', user.username);
    
    user.channels.push(room);
    
    if (rooms.hasOwnProperty(room)) {
      var found = -1;
      
      for (var i = 0; i < rooms[room].users.length; i++) {
        if (rooms[room].users[i].username == user.username) {
          found = i;
        }
      }
      
      if (found > -1) {
        rooms[room].users[found] = user;
        console.log('Readding user');
      } else {
        rooms[room].users.push(user);
        console.log('Adding user');
      }
    } else {
      create_room(room, user);
    }
  }
}

function create_room(room, user) {
  console.log('creating room');
  rooms[room] = {users: [user]};
  console.log(rooms);
}
