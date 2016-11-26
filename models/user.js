var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var uuid = require('node-uuid');

var userSchema = new Schema({
	_id: {type: String, default: uuid.v1},
	username: {type: String, unique: true}
});



var User = mongoose.model('User', userSchema);

module.exports = User; 