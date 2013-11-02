var Class = require('jsOOP').Class;
var vec2 = require('gl-matrix').vec2;

//TODO: What about other types? Vector3, Vector4 ? 
//Or should Kami be more generic, and just use Point and Point3D ? 

/**
 * This is a convenience wrapper around gl-matrix "vec2"
 * type. i.e. This is really just backed by a Float32Array,
 * with properties "x" and "y" which access the array.
 * 
 * For performance, you should access the array directly
 * or use it for gl-matrix computations. For convenience,
 * you can use the "x" and "y" properties.
 * 
 * @type {Class}
 */
var Point = new Class({
	
	/**
	 * This is the Float32Array which can be accessed
	 * directly for performance or gl-matrix operations.
	 * 
	 * @type {Float32Array}
	 */
	items: null,

	initialize: function(x, y) {
		x = x || 0;
		y = y || 0;

		this.items = vec2.fromValues(x, y);
	},

	x: {
		get: function() {
			return this.items[0];
		},
		set: function(val) {
			this.items[0] = val;
		}
	},

	y: {
		get: function() {
			return this.items[1];
		},
		set: function(val) {
			this.items[1] = val;
		}
	},

	toString: function() {
		return "(" + this.x + ", " + this.y + ")";
	}
});

module.exports = Point;