"use strict";

var http = require('http.min');
var devices = {};
var tempIP, tempPort, tempToken;

module.exports.settings = function( device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback ) {

    Homey.log ('Changed settings: ' + JSON.stringify(device_data) + ' / ' + JSON.stringify(newSettingsObj) + ' / old = ' + JSON.stringify(oldSettingsObj));
    
    try {
      changedKeysArr.forEach(function (key) {
        devices[device_data.id].settings[key] = newSettingsObj[key]
      })
      callback(null, true)
    } catch (error) {
      callback(error)
    }

};


module.exports.init = function(devices_data, callback) {
    
    devices_data.forEach(function initdevice(device) {
	    
	    Homey.log('add device: ' + JSON.stringify(device));
	    
	    devices[device.id] = device;
	    
	    
	    module.exports.getSettings(device, function(err, settings){
		    devices[device.id].settings = settings;
		});
		
	});
	
	Homey.log("Nuki app - init done");
	
	callback (null, true);
};

module.exports.deleted = function( device_data ) {
    
    Homey.log('deleted: ' + JSON.stringify(device_data));
    
    devices[device_data.id] = [];
	
};

module.exports.pair = function (socket) {
	// socket is a direct channel to the front-end

	// this method is run when Homey.emit('list_devices') is run on the front-end
	// which happens when you use the template `list_devices`
	socket.on('list_devices', function (data, callback) {

		Homey.log("Nuki app - list_devices tempIP is " + tempIP);
		
		//get devices by calling /list
		http('http://' + tempIP + ':' + tempPort + '/list?token=' + tempToken).then(function (result) {
		
			Homey.log('Code: ' + result.response.statusCode);
			Homey.log('Response: ' + result.data);
			
			if (result.response.statusCode == 404) {
				callback ('Invalid lock ID', false);
			} else if (result.response.statusCode == 401) {
				callback ('Invalid token', false);
			} else if (result.response.statusCode == 200) {
			
				//OUTPUT: [{"nukiId": 1, "name": "Home"}, {"nukiId": 2, "name": "Grandma"}]
				//result.data = '[{"nukiId": 1, "name": "Home"}, {"nukiId": 2, "name": "Grandma"}]';
				//DEBUG:
				/*	
					result.data = [{
						nukiId: 1, 
						name: "Home"
					},
					{
						nukiId: 2, 
						name: "Grandma"
					}];
				*/
					
				if (result.data && result.data != "[]") {
				
					Homey.log ('Got result.data' + JSON.stringify (result.data));
					
					var add_devices = [];
					
					//DEBUG:
					//var parsed_data = result.data;
					var parsed_data = JSON.parse (result.data);
						
					for (var i = 0; i < parsed_data.length; i++) {
						
						Homey.log ('__add new device: ' + parsed_data[i].name);
						add_devices.push(
							{
								name	: parsed_data[i].name,
								data: {
									id	:	parsed_data[i].nukiId
								},
								settings: {
									"ipaddress"		:	tempIP,
									"port"			: tempPort,
									"token"			: tempToken
								},
								capabilities: ['locked']
							}
						);
						
						devices[parsed_data[i].name] = {
							name	: parsed_data[i].name,
							data: {
								id	:	parsed_data[i].nukiId
							},
							settings: {
								"ipaddress"		:	tempIP,
								"port"			: tempPort,
								"token"			: tempToken
							},
							capabilities: ['locked']
						}
						
						
					}
					
					Homey.log('add_devices: ' + JSON.stringify(add_devices));
					callback (null, add_devices);

					
				} else {
				
					Homey.log ('No devices found');	
					callback ('No devices found', null);
									
				}
				
			} else {
				
				callback ('Error code sendcommand: ' + result.response.statusCode, false);
			
			}
	
		});

	});

	// this is called when the user presses save settings button in start.html
	socket.on('get_devices', function (data, callback) {

		// Set passed pair settings in variables
		tempIP = data.ipaddress;
		tempPort = data.port;
		tempToken = data.token;
		
		Homey.log ( "Nuki app - got get_devices from front-end, tempIP =" + tempIP + " / token = " + tempToken + " / port = " + tempPort );

		// assume IP is OK and continue
		socket.emit ('continue', null);

	});

	socket.on('disconnect', function(){
		Homey.log("Nuki app - User aborted pairing, or pairing is finished");
	})
}


module.exports.capabilities = {
    locked: {

        get: function( device_data, callback ){

			sendcommand (device_data.id, 'lockState?nukiId=' + device_data.id, true, function (data) {
		
				if (data.state == 1) callback (null, true); else callback (null, false);
				
			});
	        
        },

        set: function( device_data, turnon, callback ) {
	        
	        Homey.log('Setting device_status of ' + devices[device_data.id].settings.ipaddress + ' to ' + turnon);

			if (turnon) {
				
				sendcommand (device_data.id, 'lockAction?nukiId=' + device_data.id + '&action=' + 2, callback);
				
			} else {
				
				sendcommand (device_data.id, 'lockAction?nukiId=' + device_data.id + '&action=' + 1, callback);
				
			}

        }
    }
}


Homey.manager('flow').on('condition.isLocked', function (callback, args) {
	
	//Homey.log('condition args: ' + JSON.stringify(args));
	//args.device.id
	
	sendcommand (args.device.id, 'lockState?nukiId=' + args.device.id, true, function (data) {
		
		callback (null, data.state);
		
	});
	
});


Homey.manager('flow').on('action.lockAction', function (callback, args) {
	
	sendcommand (args.device.id, 'lockAction?nukiId=' + args.device.id + '&action=' + args.action.inputName, false, callback);
	
});


Homey.manager('flow').on('action.lockAction.action.autocomplete', function (callback, value) {
	
	var items = searchForActions(value.query);
	callback(null, items);

});


function sendcommand(device_id, command, returndata, callback) {
	
	http('http://' + devices[device_id].settings.ipaddress + ':' + devices[device_id].settings.port + '/' + command + '&token=' + devices[device_id].settings.token).then(function (result) {
		
		Homey.log('Code: ' + result.response.statusCode);
		Homey.log('Response: ' + result.data);
		
		if (result.response.statusCode == 404) {
			callback ('Invalid lock ID', false);
		} else if (result.response.statusCode == 401) {
			callback ('Invalid token', false);
		} else if (result.response.statusCode == 200) {
		
			if (result.data.batteryCritical) Homey.manager('flow').triggerDevice('batteryCritical', {}, {device: device_id});
			
			if (returndata) {
				
				callback (result.data);
				
			} else {
				
				if (result.data.success) callback (null, true); else callback (null, false);
		
			}
			
		} else {
			
			callback ('Error code sendcommand: ' + result.response.statusCode, false);
		
		}
	
	});
	
}

function searchForActions (value) {
	
	var possibleInputs = [
		{
			inputName: "1",
			friendlyName: __("unlock")
		},
		{
			inputName: "2",
			friendlyName: __("lock")
		},
		{
			inputName: "3",
			friendlyName: __("unlatch")
		},
		{
			inputName: "4",
			friendlyName: __("lockngo")
		},
		{
			inputName: "5",
			friendlyName: __("lockngowithunlatch")
		}
	];
	
	var tempItems = [];
	for (var i = 0; i < possibleInputs.length; i++) {
		var tempInput = possibleInputs[i];
		if ( tempInput.friendlyName.toLowerCase().indexOf(value.toLowerCase()) >= 0 ) {
			tempItems.push({ icon: "", name: tempInput.friendlyName, inputName: tempInput.inputName });
		}
	}
	return tempItems;
}