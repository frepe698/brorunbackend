var express = require('express');
var router = express.Router();
var mongodb = require('mongodb');

var uuid = require('node-uuid');

var mqttclient = require('../mqttclient');
var distanceCalc = require('../distance_calc');


//Database models
var Event = require('../models/event');
var User = require('../models/user');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});


router.get('/events', function(req,res){
	Event.find({}, '_id name players', function(err, events){
		if(err) throw err;
		res.send(events);
	});
});

router.get('/newevent', function(req,res){
	res.render('newevent', {title: 'Create Event'});
});

router.post('/publish_coordinates', function(req,res){
	var message = req.body.message;
	var topic = "events/" + req.body.topicId + "/coordinates";
	
	console.log("Publishing to topic: " + topic);	
	
	mqttclient.publish(topic, JSON.stringify(message));
	res.send("Publised message to broker");
});

router.post('/create_event', function(req,res){
	var eventName = req.body.name;
	var eventLength = req.body.length;
	var newEvent = new Event({
		name: eventName,
		length: eventLength,
		start_time: null
	});
	newEvent.addPlayer(req.body.playerId);
	console.log(newEvent);

	newEvent.save(function(err){
		if(err) throw err;

		var topic = "events/" + newEvent._id + "/coordinates";
		mqttclient.subscribe(topic);
		console.log("Subscribed to topic: " + topic);
		var retVal = {
				"topicId": newEvent._id,
				"playerId": newEvent.players[0]._id,
				"players": newEvent.players
			}
		res.send(JSON.stringify(retVal));
	});

});

router.post('/update_player', function(req,res){
	
	var topicId = req.body.topicId;
	var playerId = req.body.playerId;
	var coordinates = req.body.coordinates;
	var name = req.body.name;

	
	Event.findById(topicId, function(err, event){
		console.log("Event: " + event);
		var player = event.players.id(playerId);
		if(player){
			var lastLat = player.latitude;
			var lastLong = player.longitude;

			if(lastLat && lastLong ) {
				player.distance += distanceCalc.measure(lastLat, lastLong, coordinates.lat, coordinates.long);
				
			}
			player.latitude = coordinates.lat;
			player.longitude = coordinates.long;
			
		}
		console.log("Player: " + player);

		event.save(function(err){
			if(err) throw err;
			console.log("Saved successfully");
		});
	});
	res.send("Player updated");
});

router.post('/join_event', function(req,res){
	var topicId = req.body.topicId;
	var playerId = req.body.playerId;
	if(playerId == null){
		playerId = uuid.v1();
	}
	Event.findById(topicId, function(err, event){
		event.players.push({
			_id: playerId,
			latitude: null,
			longitude: null,
			distance: 0
		});
		event.save(function(err){
			if(err) throw err;
			console.log("Player saved");
			
			var topic = "events/" + event._id + "/joined";
			var msg = {"playerId" : playerId};
			mqttclient.publish(topic, JSON.stringify(msg));
			
			var retVal = {
				"topicId": event._id,
				"playerId": playerId,
				"players": event.players
			}
			res.send(JSON.stringify(retVal));
		});
	});
});

router.post('/leave_event', function(req, res){
	var topicId = req.body.topicId;
	var playerId = req.body.playerId;
	Event.findByIdAndUpdate(topicId, {
		$pull:{
			players: {_id : playerId}
		}
	}, function(err, event){
		event.save(function(err){
			if(err) res.send(err);
			var topic = "events/" + event._id + "/left";
			var msg = {"playerId" : playerId};
			mqttclient.publish(topic, JSON.stringify(msg));
			res.send(event);	
		});
		
	});
});

router.post('/signup', function(req,res){
	var name = req.body.username;

	User.findOne({username: name}, function(err, user){
		if(user) {
			res.send("Name is not unique");
			return;
		}
		else{
			var user = new User({
				username: name
			});	

			user.save(function(err){
				if(err) res.send("Name is in use");
				var retVal = {
					"username": user.username,
					"_id": user._id
				}
				res.send(retVal);
			});	
		}
		

	});
	

});

//TODO: add "unready"
router.post('/player_ready', function(req, res){
	var topicId = req.body.topicId;
	var playerId = req.body.playerId;

	Event.findById(topicId, function(err, event){
		if(err || !event) {
			var response = {
				"status": "Could not find event"
			}
			res.send(response);
			return;
		}
		var player = event.players.id(playerId);
		if(player){
			player.ready = true;
			
		} else {
			var response = {
				"status": "Could not find player"
			}
			res.send(response);
			return;
		}
		var allReady = true;
		for(var i = 0; i < event.players.length; i++){
			if(event.players[i].ready == false) {
				allReady = false;
			}
		}
		if(allReady) {
			//Starting event in 10 seconds, be ready!
			var startTime = new Date(+new Date() + 10 * 1000);
			event.start_time = startTime;
			console.log("Starting event at: " + event.start_time + 
				" time now: " + new Date());
		}
		event.save(function(err){
			if(err) throw err;
			console.log("Saved successfully");
			var pubTopic = "events/" + topicId + "/player_ready";
			var pubMessage = {
				"playerId": playerId
			};
			console.log("Sending message:" + JSON.stringify(pubMessage) + "to topic: " + pubTopic);
			mqttclient.publish(pubTopic, JSON.stringify(pubMessage));

			if(allReady) {
				var startPubTopic = "events/" + topicId + "/starting"
				var startPubMessage = {
					"startTime": event.start_time
				};
				console.log("Sending message:" + JSON.stringify(startPubMessage) + "to topic: " + startPubTopic);
			
				mqttclient.publish(startPubTopic, JSON.stringify(startPubMessage));
			};
			var response = {
				"status": "player ready"
			}
			res.send(response);
		});
	});
	
});

router.post('/test/publish_coordinates', function(req,res){
	var topicId = req.body.topicId;
	var playerId = req.body.playerId;
	var latitude = req.body.lat;
	var longitude = req.body.long;

	var pubMessage = {
		"playerId": playerId,
		"coordinates": {
			"lat" : latitude,
			"long": longitude
		}
	};
	var pubTopic = "events/" + topicId + "/coordinates";
	console.log("Published message " + pubMessage + " to topic " + pubTopic);
	mqttclient.publish(pubTopic, JSON.stringify(pubMessage));

	res.send("Publised coordinates to topic");
});
module.exports = router;
