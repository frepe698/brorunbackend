var express = require('express');
var router = express.Router();
var mongodb = require('mongodb');
var uuid = require('node-uuid');

var mqttclient = require('../mqttclient');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/create_event', function(req,res){
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
	var MongoClient = mongodb.MongoClient;

	var url = 'mongodb://localhost:27017/zmap';

	MongoClient.connect(url, function(err, db){
		if(err){
			console.log('Unable to connect to the server', err);

		} else{
			console.log('Connection established');

			var collection = db.collection('events');

			collection.find({}).toArray(function(err, result){
				if(err){
					res.send(err);
				} else if(result.length){
					res.send(result);
				} else{
					res.send('No documents found');
				}
				db.close();
			});
		}
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

module.exports = router;
