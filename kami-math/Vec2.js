var Class = require('jsOOP').Class;
var VecBase = require('./VecBase');

var Vec2 = new Class({

	Extends: VecBase,

	initialize: function(x, y) {
		this.parent(x || 0, 
					y || 0);
	},

	length2: function() {
		return this.x * this.x + this.y * this.y;
	},

	normalize: function() {
		var len = this.length();
		if (len != 0) {
			this.x /= len;
			this.y /= len;
		}
	},
});

module.exports = Vec2;