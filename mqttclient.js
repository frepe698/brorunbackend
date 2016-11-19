const mqtt = require('mqtt');
//const mqttclient = mqtt.connect('mqtt://broker.hivemq.com');
//const mqttclient = mqtt.connect('tcp://localhost:1883');
const mqttclient = mqtt.connect('mqtt://test.mosquitto.org');
var mongodb = require('mongodb');
var distanceCalc = require('./distance_calc');

var url = 'mongodb://localhost:27017/zmap';

mqttclient.on('connect', function(){
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
		
		var MongoClient = mongodb.MongoClient;
		MongoClient.connect(url, function(err, db){
		if(err){
			console.log('Unable to connect to the server', err);
		} else{
			console.log('Connection established');

			var collection = db.collection('events');
			collection.findOne({"topic_id":topicId}, function(err, event){
				if(err){
					console.log(err);
					db.close();
				} else if(event != null){
					console.log("Found event in db:");
					console.log(event);
					var lastLat = event.lastLocation.lat;
					var lastLong = event.lastLocation.long;
					var distance = event.totalDistance;
					if(lastLat && lastLong ) {
						distance = distanceCalc.measure(lastLat, lastLong, msgObj.coordinates.lat, msgObj.coordinates.long);
						lastLat = msgObj.coordinates.lat;
						lastLong = msgObj.coordinates.long;
					} 
					else {
						lastLat = msgObj.coordinates.lat ;
						lastLong = msgObj.coordinates.long;
					}			

					collection.update(
						{"topic_id":topicId}, 
						{$set: {"lastLocation.lat":lastLat,
								"lastLocation.long": lastLong,
								"totalDistance": distance}}, 
						function(err, event){
							if(err){
								console.log(err);
							}
							db.close();

							//Publish new distance to mqtt topic
							var pubTopic = "events/" + topicId + "/distance";
							var pubMessage = {
								"distance": distance
							};
							mqttclient.publish(pubTopic, JSON.stringify(pubMessage));
						});
					
				} else{
					console.log('No documents found');
					db.close();
				}
				
			});
		}
	});
	}
});

module.exports = mqttclient;