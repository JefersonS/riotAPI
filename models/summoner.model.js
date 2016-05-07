var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var summoner = Schema({
	summoner_id: String,
	champion_id: String,
	division: String,
	league: String
});

var SummonerSchema = new Schema({
	region: String,
	date_finished: String,
	summoner: summoner,
	fellowPlayer: summoner
});

mongoose.model('Summoner', SummonerSchema, summoners);