var express = require('express');
var router = express.Router();
var mongodb = require('mongodb');

var uuid = require('node-uuid');

var mqttclient = require('../mqttclient');
var distanceCalc = require('../distance_calc');


//Database models
var Event = require('../models/event');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/create_event_v2', function(req,res){
	var MongoClient = mongodb.MongoClient;
	var url = 'mongodb://localhost:27017/zmap';

	MongoClient.connect(url, function(err, db){
		if(err){
			console.log('Unable to connect to the server', err);
		} else{
			console.log('Connection established');

			var collection = db.collection('events');

			//Create new topic for mqtt, add to db and send back to client
			var topicId = uuid.v1();
			var event = {
					name: req.body.name,
					lastLocation: {
						lat: null,
						long: null
					},
					totalDistance: 0,
					topic_id: topicId
				};
			if(event.name == null){
				console.log("Malformed request");
				res.send("Malformed request");
			} else{
				collection.insert([event], function(err, result){
					if(err){
						console.log(err);
					} else{
						var topic = "events/" + topicId + "/coordinates";
						console.log("new topic is: " + topic);
						mqttclient.subscribe(topic);
						var retVal = {
							"name": event.name,
							"topicId": topicId
						}
						res.send(JSON.stringify(retVal));
					}
					db.close();
				});
			}
		}
	});
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
	var newEvent = new Event({
		name: "Yolo"
	});
	newEvent.addPlayer();
	console.log(newEvent);

	newEvent.save(function(err){
		if(err) throw err;

		var topic = "events/" + newEvent._id + "/coordinates";
		mqttclient.subscribe(topic);
		console.log("Subscribed to topic: " + topic);
		var retVal = {
			"topicId": newEvent._id,
			"playerId": newEvent.players[0]._id
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
	var playerId = uuid.v1();
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
			var retVal = {
				"topicId": event._id,
				"playerId": playerId
			}
			var topic = "events/" + event._id + "/joined";
			var msg = {"playerId" : playerId};
			mqttclient.publish(topic, JSON.stringify(msg));
			
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

module.exports = router;
