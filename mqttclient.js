const mqtt = require('mqtt');
//const mqttclient = mqtt.connect('mqtt://broker.hivemq.com');
const mqttclient = mqtt.connect('tcp://localhost:1883');
//const mqttclient = mqtt.connect('mqtt://test.mosquitto.org');

var Event = require('./models/event');

var distanceCalc = require('./distance_calc');



mqttclient.on('connect', function(){
	Event.find({}, function(err, events){
		events.forEach(function(event){
			var topic = "events/" + event._id + "/coordinates";
			mqttclient.subscribe(topic);
			console.log("Subscribed to topic: " + topic);
		});
	});
	console.log("Connected to broker");
});

mqttclient.on('message', function(topic, message){
	console.log("Received message:" + message.toString() + "from topic:" + topic.toString());
	var topicValues = topic.split("/");
	if(topicValues.length != 3 ||
		topicValues[0] != "events" ||
		topicValues[2] != "coordinates"){
		console.log("I don't want this message");
	} else{
		
		var topicId = topicValues[1];
		var msgObj = JSON.parse(message);
		var playerId = msgObj.playerId;
		var latitude = msgObj.coordinates.lat;
		var longitude = msgObj.coordinates.long;
		
		Event.findById(topicId, function(err, event){
			if(err || !event) {
				console.log("No event found for message over mqtt");
				return;
			}
			if(event.finished == true) {
				console.log("Event is already finished");
				return;
			}
			if(event.start_time == null || event.start_time > new Date()) {
				console.log("Event has not started yet. Event will start: " + event.start_time + 
					" now: " + new Date());
				return;
			}
			var player = event.players.id(playerId);
			if(player){
				var lastLat = player.latitude;
				var lastLong = player.longitude;

				if(lastLat && lastLong ) {
					player.distance += distanceCalc.measure(lastLat, lastLong, latitude, longitude);
					if(player.distance >= event.length) {
						event.finished = true;
						event.winner = player._id;
						var winnerTopic = "events/" + topicId + "/winner";
						var winnerMessage = {
							"playerId": player._id
						};
						console.log("Sending message: " + JSON.stringify(winnerMessage) + " to topic: "
							+ winnerTopic);
						mqttclient.publish(winnerTopic, JSON.stringify(winnerMessage));
					}
				}
				player.latitude = latitude;
				player.longitude = longitude;
				
			}

			event.save(function(err){
				if(err) throw err;
				console.log("Saved successfully");
				var pubTopic = "events/" + topicId + "/distance";
				var pubMessage = {
					"distance": player.distance,
					"playerId": playerId
				};
				console.log("Sending message:" + JSON.stringify(pubMessage) + "to topic: " + pubTopic);
				mqttclient.publish(pubTopic, JSON.stringify(pubMessage));
			});
		});
	}
});

module.exports = mqttclient;