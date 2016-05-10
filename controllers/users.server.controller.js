/*
	request id by name
		request matches by id
			fill mongo with each summoner
				for each summoner find their elo
					for each fellow player find their elo
						maybe find each one last matches, then count their recent roles and champions (not done)
				
 */	

var request = require('request');
var waterfall = require("async/waterfall");
var each = require("async/each");
var whilst = require("async/whilst");
var MongoClient = require("mongodb").MongoClient;
var Summoner = require('mongoose').model('Summoner');
var moment = require('moment');
config = require('../config/config');
var name = "";
var id = "";

const MAXIMUM_IDS_PER_REQUEST = 10;
const MADRUGADA = "00:00";
const MANHA = "05:00";
const DIA = "07:00";
const TARDE = "12:00";
const NOITE = "18:00";
const FIM_NOITE = "23:59";

module.exports = {
	index: function(req, res){
		res.render('find');
	},

	find: function(req, res){
		var name = req.query.name;
		var processId = req.query.processId;
		res.json({ success: true, 'summoner': name });

		process_summoner();		
	},

	tell_summoner: function(req, res){
		var name = req.body.name;
		id = req.body.id;
 		waterfall([
 			find_and_create_summoner_list,
 			change_date_to_time,
 			define_time,
 			sort_array
 		], function(err, list_of_options){
 			console.log(list_of_options);
 		});
	},
}

/*
 * Waterfall for all the processes related to the summoner
 */

function process_summoner(){
		waterfall([
			find_id_by_name,
			find_recent_games,
			save_summoner_fellow_player,
			find_insert_division_tier_summoner,
			find_insert_division_tier_fellows
		], function (err, summoner_id) {
			console.log("End of process for summoner: " + name + " id: " + summoner_id);
			request.post('https://5f44640b.ngrok.io/users/tell_summoner').form({name:name, id: summoner_id});
			//request.post('http://service.com/upload').form({key:'value'})
		});		
	}

/*
 * Find summoner's ID by nane
 */

function find_id_by_name(callback) {
	request('https://br.api.pvp.net/api/lol/br/v1.4/summoner/by-name/'+name+'?api_key='+config.key, function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	    body = (JSON.parse(body));
    	callback(null, body[name].id);
	  }else{
	  	callback({error: error, response: response});
	  }
	});
}

/*
 * Find recent games of summoner_id
 */

function find_recent_games(summoner_id, callback) {
	request('https://br.api.pvp.net/api/lol/br/v1.3/game/by-summoner/'+summoner_id+'/recent?api_key='+config.key, function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	    body = (JSON.parse(body));
    	callback(null, body["games"], summoner_id);
	  }else{
	  	callback({error: error, response: response});
	  }
	});
}

/*
 * Create a registry for each fellow player with their champion id
 */

function save_summoner_fellow_player(games, summoner_id, callback) {
    var fellowPlayers = "";
    each(games, function(value, each_callback){
    	each(value["fellowPlayers"], function(value2, each_callback2){
    		fellowPlayers += value2.summonerId+",";
        	Summoner.update(
        	{
        		"summoner.summoner_id": summoner_id,
        		"fellowPlayer.summoner_id": value2.summonerId
        	},
        	{
        		region: "br",
				date_finished: value.createDate,
        		summoner: {
        			summoner_id: summoner_id,
        			champion_id: value.championId
        		},
				fellowPlayer: {
					summoner_id: value2.summonerId,
        			champion_id: value2.championId
				}
        	},
        	{
        		upsert: true
        	}, function(err, inserted){
        		each_callback2(null);
        	});
    	}, function(err){
			each_callback(null);
		});
    }, function(err){
		callback(null, summoner_id, fellowPlayers);
	});
}

/*
 * Find and insert division and tier by summoner id
 */

function find_insert_division_tier_summoner(summoner_id, fellowPlayers, callback){
	request('https://br.api.pvp.net/api/lol/br/v2.5/league/by-summoner/'+summoner_id+'/entry?api_key='+config.key, function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	    body = (JSON.parse(body));

		Summoner.update(
		{
			"summoner.summoner_id": summoner_id
		},
		{
			$set:{
					"summoner.division": body[summoner_id][0]["entries"][0].division,
					"summoner.league": body[summoner_id][0].tier
			}
		},
		{
			multi: true
		}, function(err, updated){
    		callback(null, fellowPlayers, summoner_id);
		});

	  }else{
	  	callback({error: error, response: response});
	  }
	});
}

/*
 * Find and insert division and tier by fellow player list of summoner id
 */

function find_insert_division_tier_fellows(fellowPlayers, summoner_id, callback){
	var fellowPlayers_to_array = fellowPlayers.split(",");
	var times_to_repeat = parseInt(fellowPlayers_to_array.length/MAXIMUM_IDS_PER_REQUEST);
	whilst(
	    function(){ return times_to_repeat > 0 },
	    function(whilst_callback){
    		var fellowPlayers_list = fellowPlayers_to_array.splice(0, MAXIMUM_IDS_PER_REQUEST);
    		fellowPlayers_list = fellowPlayers_list.toString();
    		if(fellowPlayers_list != "" && fellowPlayers_list != " "){
		    	request('https://br.api.pvp.net/api/lol/br/v2.5/league/by-summoner/'+fellowPlayers_list+'/entry?api_key='+config.key, function (error, response, body) {
				  if (!error && response.statusCode == 200) {
				    body = (JSON.parse(body));
		        	fellowPlayers_list = fellowPlayers_list.split(",");
			    	each(fellowPlayers_list, function(value, each_callback){
			    		if(body[value] != undefined){
							Summoner.update(
							{
								"fellowPlayer.summoner_id": parseInt(value)
							},
							{
								$set:{
/*hadouken --)*/					"fellowPlayer.division": body[value][0]["entries"][0].division,
/*hadouken --)*/					"fellowPlayer.league": body[value][0].tier
								}
							},
							{
								multi: true
							}, function(err, updated){
				    			each_callback(null);
							});
						}else{
							each_callback(null);
						}
			    	}, function(err){
			    		times_to_repeat--;
			    		whilst_callback(null);
			    	});
				  }else{
				  	times_to_repeat--;
				  	whilst_callback({error: error, response: response});
				  }
				});
			}else{
				times_to_repeat--;
				whilst_callback(null);
			}		       	
	    }, function (err) {
	        callback(null, summoner_id);
	    }
	);
}

function find_and_create_summoner_list(callback){
	var list_of_options = [];

	Summoner.find(
		{$or:[
			{"summoner.summoner_id": id},
			{"fellowPlayer.summoner_id": id}
		]},
		function(err, list){
			each(list, function(value, each_callback){
				if(value.summoner.summoner_id == id){
					list_of_options.push(
						{
							id: value.fellowPlayer.summoner_id,
							time: value.date_finished,
							tier: value.fellowPlayer.league,
							division: value.fellowPlayer.division
						}
					);
					each_callback(null);
				}else{
					list_of_options.push(
						{
							id: value.summoner.summoner_id,
							time: value.date_finished,
							tier: value.summoner.league,
							division: value.summoner.division
						}
					);
					each_callback(null);
				}
			}, function(err){
				callback(null, list_of_options);
			});
		}
	);
}

function change_date_to_time(list_of_options, callback){
	each(list_of_options, function(value, each_callback){
		value.time = moment(parseInt(value.time)).format("HH:mm").toString();
		each_callback(null);
	}, function(err){
		callback(null, list_of_options);
	});
}

function define_time(list_of_options, callback){
	each(list_of_options, function(value, each_callback){
		value.moment = define_moment(value.time);
		each_callback(null);
	}, function(err){
		callback(null, list_of_options);
	});
}

/*function find_match(list_of_options, callback){
	each(list_of_options, function(value, each_callback){
		value.moment = define_moment(value.time);
		each_callback(null);
	}, function(err){
		callback(null, list_of_options);
	});
}*/

function sort_array(list_of_options, callback){
	list_of_options.sort(function(value1, value2){ return value1 - value2 })
	callback(null, list_of_options);
}

function define_moment(value){
	if(value >= MADRUGADA && value < MANHA){ value = "madrugada"; }
	if(value >= MANHA && value < DIA){ value = "manha"; }
	if(value >= DIA && value < TARDE){ value = "dia"; }
	if(value >= TARDE && value < NOITE){ value = "tarde"; }
	if(value >= NOITE && value < FIM_NOITE){ value = "noite"; }

	return value;
}