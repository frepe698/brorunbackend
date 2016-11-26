var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var uuid = require('node-uuid');

var playerSchema = new Schema({
	_id: {type: String, default: uuid.v1},
	latitude: Number,
	longitude: Number, 
	distance: Number,
	updated: {type: Date, default: Date.now}
});


var eventSchema = new Schema({
	_id: {type: String, default: uuid.v1},
	name: String,
	length: Number,
	start_time: String,
	players: [playerSchema]
});


eventSchema.methods.addPlayer = function() {
	this.players.push({
		latitude: null,
		longitude: null,
		distance: 0
	});
};

eventSchema.methods.updateName = function() {
	this.name = "Arne";
	return this.name;
};





var Event = mongoose.model('Event', eventSchema);

module.exports = Event; 