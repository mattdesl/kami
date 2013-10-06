var Class = require('jsOOP').Class;

var VecBase = new Class({

	initialize: function(x, y, z, w) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;
	},

	///// SHARED FUNCTIONS
	length: function() { 
		return Math.sqrt(this.length2);
	},

	///// INTERFACE
	length2: function() { },
	normalize: function() { },

	///// ALIASES
	len: function() { return this.length(); },
	len2: function() { return this.length2(); },
	nor: function() { return this.normalize(); },
	// mul: function(v) { return this.multiply(v); }
});

module.exports = VecBase;