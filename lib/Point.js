/**
 * @module kami
 */

var Class = require('jsOOP').Class;
var vec2 = require('gl-matrix').vec2;

//TODO: What about other types? Vector3, Vector4 ? 
//Or should Kami be more generic, and just use Point and Point3D ? 

/**
 * This is a convenience wrapper around [gl-matrix](http://glmatrix.net/) "vec2"
 * type. It is backed by a Float32Array, and the `x` and `y` properties are included
 * for convenience.
 * 
 * For performance, or when performing gl-matrix operations, 
 * you should access the `items` array directly. 
 * For convenience and clarity, the `x` and `y` properties are encouraged.
 * 
 * @class Point
 * @constructor
 * @param {Number} x the x position
 * @default  0
 * @param {Number} y the y position
 * @default  0
 */
var Point = new Class({
	
	/**
	 * This is the Float32Array which can be accessed
	 * directly for better performance or gl-matrix operations.
	 * 
	 * @property items
	 * @type {Float32Array}
	 */
	items: null,

	//Constructor
	initialize: function(x, y) {
		x = x || 0;
		y = y || 0;

		this.items = vec2.fromValues(x, y);
	},

	/**
	 * Reads or writes the "x" value in the backing array (the first element).
	 *
	 * @attribute
	 * @default  0
	 * @type {Number}
	 */
	x: {
		get: function() {
			return this.items[0];
		},
		set: function(val) {
			this.items[0] = val;
		}
	},

	/**
	 * Reads or writes the "y" value in the backing array (the second element).
	 *
	 * @attribute
	 * @default  0
	 * @type {Number}
	 */
	y: {
		get: function() {
			return this.items[1];
		},
		set: function(val) {
			this.items[1] = val;
		}
	},

	/**
	 * Returns a string representation of this point.
	 * @return {String} a string value for this point
	 */
	toString: function() {
		return "(" + this.x + ", " + this.y + ")";
	}
});

module.exports = Point;