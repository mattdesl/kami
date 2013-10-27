;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var WebGLCanvas = require('kami').WebGLCanvas;
var ShaderProgram = require('kami').ShaderProgram;

$(function() {
	var mainContainer = $("body").css({
		background: "#000"
	});

	var demoContainers = [];
	var currentDemo = null;
	var currentIndex = 0;


	var width = 800;
	var height = 600;

	var canvas = $("<canvas>", {
		width: width,
		height: height
	}).css({
		background: "#343434",  
		position: "fixed",
		top: 0,
		left: 0,
		overflow: "hidden"
	});

	canvas.appendTo(mainContainer);


	// var renderer = new WebGLRenderer(width, height, canvas[0]);
	
	var context = new WebGLCanvas(800, 600, null, {
		antialias: true	
	});
  	
	var shader = new ShaderProgram(context.gl, $("#vert_shader").html(), $("#frag_shader").html());

	requestAnimationFrame(render);

	function render() {
		
		requestAnimationFrame(render);
	}
}); 
},{"kami":4}],2:[function(require,module,exports){
var Class = require('jsOOP').Class;

var ShaderProgram = new Class({
	
	vertSource: null,
	fragSource: null, 
 
	vertShader: null,
	fragShader: null,

	program: null,

	uniformCache: null,
	attributeCache: null,

	initialize: function(gl, vertSource, fragSource, attribLocations) {
		if (!gl)
			throw "no GL context specified";
		if (!vertSource || !fragSource)
			throw "vertex and fragment shaders must be defined";

		this.gl = gl;

		this.attribLocations = attribLocations;

		//We trim (ECMAScript5) so that the GLSL line numbers are
		//accurate on shader log
		this.vertSource = vertSource.trim();
		this.fragSource = fragSource.trim();

		this._compileShaders();
	},

	//Compiles the shaders, throwing an error if the program was invalid.
	_compileShaders: function() {
		var gl = this.gl; 

		
		this.vertShader = this._loadShader(gl.VERTEX_SHADER, this.vertSource);
		this.fragShader = this._loadShader(gl.FRAGMENT_SHADER, this.fragSource);

		if (!this.vertShader || !this.fragShader)
			throw "Error returned when calling createShader";

		this.program = gl.createProgram();

		if (this.attribLocations) {
			for (var key in this.attribLocations) {
				if (this.attribLocations.hasOwnProperty(key))
		    		gl.bindAttribLocation(this.program, this.attribLocations[key], key);
			}
		}

		gl.attachShader(this.program, this.vertShader);
		gl.attachShader(this.program, this.fragShader);
		gl.linkProgram(this.program); 

		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			throw "Error linking the shader program:\n"
				+ gl.getProgramInfoLog(this.program);
		}

		this._fetchUniforms();
		this._fetchAttributes();
		
		// for (var k in this.uniformCache)
		// 	console.log(k, this.uniformCache[k])
		// for (var k in this.attributeCache)
		// 	console.log(k, this.attributeCache[k])
	},

	_fetchUniforms: function() {
		var gl = this.gl;

		this.uniformCache = {};

		var len = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
		if (!len) //null or zero
			return;

		for (var i=0; i<len; i++) {
			var info = gl.getActiveUniform(this.program, i);
			if (info === null) 
				continue;
			var name = info.name;
			var location = gl.getUniformLocation(this.program, name);
			
			this.uniformCache[name] = {
				size: info.size,
				type: info.type,
				location: location
			};
		}
	},

	_fetchAttributes: function() { 
		var gl = this.gl; 

		this.attributeCache = {};

		var len = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
		if (!len) //null or zero
			return;	

		for (var i=0; i<len; i++) {
			var info = gl.getActiveAttrib(this.program, i);
			if (info === null) 
				continue;
			var name = info.name;

			//the attrib location is a simple index
			var location = gl.getAttribLocation(this.program, name);
			
			this.attributeCache[name] = {
				size: info.size,
				type: info.type,
				location: location
			};
		}
	},

	_loadShader: function(type, source) {
		var gl = this.gl;

		var shader = gl.createShader(type);
		if (!shader) //should not occur...
			return -1;

		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) ) {
			var log = gl.getShaderInfoLog(shader);
			if (log === null) //may return null as per WebGL spec
				log = "Error executing getShaderInfoLog";
			else {
				//we do this so the user knows which shader has the error
				var typeStr = (type === gl.VERTEX_SHADER) ? "vertex" : "fragment";
				log = "Error compiling "+ typeStr+ " shader:\n"+log;
			}
			throw log;
		}
		return shader;
	},

	/**
	 * Returns the cached uniform info (size, type, location).
	 * If the uniform is not found in the cache, it is assumed
	 * to not exist, and this method returns null.
	 *
	 * This may return null even if the uniform is defined in GLSL:
	 * if it is _inactive_ (i.e. not used in the program) then it may
	 * be optimized out.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {Object} an object containing location, size, and type
	 */
	getUniformInfo: function(name) {
		return this.uniformCache.hasOwnProperty(name) 
			? this.uniformCache[name] : null; 
	},

	/**
	 * Returns the cached attribute info (size, type, location).
	 * If the attribute is not found in the cache, it is assumed
	 * to not exist, and this method returns null.
	 *
	 * This may return null even if the attribute is defined in GLSL:
	 * if it is _inactive_ (i.e. not used in the program or disabled) 
	 * then it may be optimized out.
	 * 
	 * @param  {String} name the attribute name as defined in GLSL
	 * @return {object} an object containing location, size and type
	 */
	getAttributeInfo: function(name) {
		return this.attributeCache.hasOwnProperty(name)
			? this.attributeCache[name] : null;
	},


	/**
	 * Returns the cached uniform location object.
	 * If the uniform is not found, this method returns null.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {GLint} the location object
	 */
	getAttributeLocation: function(name) {
		return this.attributeCache.hasOwnProperty(name) 
			&& this.attributeCache[name] !== null
					? this.attributeCache[name].location 
					: null; 
	},

	/**
	 * Returns the cached uniform location object.
	 * If the uniform is not found, this method returns null.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {WebGLUniformLocation} the location object
	 */
	getUniformLocation: function(name) {
		return this.uniformCache.hasOwnProperty(name) 
			&& this.uniformCache[name] !== null
					? this.uniformCache[name].location 
					: null; 
	},

	/**
	 * Returns true if the uniform is active and found in this
	 * compiled program.
	 * 
	 * @param  {String}  name the uniform name
	 * @return {Boolean} true if the uniform is found and active
	 */
	hasUniform: function(name) {
		return this.getUniformInfo(name) !== null;
	},

	/**
	 * Returns true if the attribute is active and found in this
	 * compiled program.
	 * 
	 * @param  {String}  name the attribute name
	 * @return {Boolean} true if the attribute is found and active
	 */
	hasAttribute: function(name) {
		return this.getAttributeInfo(name) !== null;
	},

	/**
	 * Returns the uniform value by name.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {any} The value of the WebGL uniform
	 */
	getUniform: function(name) {
		return this.gl.getUniform(this.program, this.getUniformLocation(name));
	},

	/**
	 * Returns the uniform value at the specified WebGLUniformLocation.
	 * 
	 * @param  {WebGLUniformLocation} location the location object
	 * @return {any} The value of the WebGL uniform
	 */
	getUniformAt: function(location) {
		return this.gl.getUniform(this.program, location);
	},
	
	setUniform: function(name, type, args) {
		//first look in cache
		//if not found,
	},

	getUniform: function(name) {

	},

	use: function() {
		this.gl.useProgram(this.shaderProgram);
	},

	destroy: function() {
		var gl = this.gl;
		gl.detachShader(this.vertShader);
		gl.detachShader(this.fragShader);

		gl.deleteShader(this.vertShader);
		gl.deleteShader(this.fragShader);

		gl.deleteProgram(this.shaderProgram);
		this.shaderProgram = null;
	}
});

module.exports = ShaderProgram;
},{"jsOOP":5}],3:[function(require,module,exports){
var Class = require('jsOOP').Class;

var WebGLCanvas = new Class({
	//extend a base class!!	
	
	initialize: function(width, height, view, contextAttributes) {
		//setup defaults
		this.view = view || document.createElement("canvas");

		//default size as per spec:
		//http://www.w3.org/TR/2012/WD-html5-author-20120329/the-canvas-element.html#the-canvas-element
		this.width = this.view.width = width || 300;
		this.height = this.view.height = height || 150;

		//setup context lost and restore listeners
		this.view.addEventListener("webglcontextlost", function (ev) {
			this._contextLost(ev);
		}.bind(this));
		this.view.addEventListener("webglcontextrestored", function (ev) {
			this._contextRestored(ev);
		}.bind(this));
		
		try {
			this.gl = this.view.getContext("webgl", contextAttributes) 
						|| this.view.getContext("experimental-webgl", contextAttributes);
		} catch (e) {
			throw "WebGL Context Not Supported -- try enabling it or using a different browser\n"
				+ e; //print err msg
		}
	},

	initGL: function() {

	},

	_contextLost: function(ev) {

	},

	_contextRestored: function(ev) {

	}
});

module.exports = WebGLCanvas;
},{"jsOOP":5}],4:[function(require,module,exports){
module.exports = {
	ShaderProgram: require('./ShaderProgram.js'),
	WebGLCanvas: require('./WebGLCanvas.js')
};
},{"./ShaderProgram.js":2,"./WebGLCanvas.js":3}],5:[function(require,module,exports){
var Class = require('./lib/Class'),
	Enum = require('./lib/Enum'),
	Interface = require('./lib/Interface');

module.exports = {
	Class: Class,
	Enum: Enum,
	Interface: Interface
};
},{"./lib/Class":6,"./lib/Enum":7,"./lib/Interface":8}],6:[function(require,module,exports){
var BaseClass = require('./baseClass');

var Class = function( descriptor ) {
	if (!descriptor) 
		descriptor = {};
	
	if( descriptor.initialize ) {
		var rVal = descriptor.initialize;
		delete descriptor.initialize;
	} else {
		rVal = function() { this.parent.apply( this, arguments ); };
	}

	if( descriptor.Extends ) {
		rVal.prototype = Object.create( descriptor.Extends.prototype );
		// this will be used to call the parent constructor
		rVal.$$parentConstructor = descriptor.Extends;
		delete descriptor.Extends;
	} else {
		rVal.$$parentConstructor = function() {}
		rVal.prototype = Object.create( BaseClass );
	}

	rVal.prototype.$$getters = {};
	rVal.prototype.$$setters = {};

	for( var i in descriptor ) {
		if( typeof descriptor[ i ] == 'function' ) {
			descriptor[ i ].$$name = i;
			descriptor[ i ].$$owner = rVal.prototype;

			rVal.prototype[ i ] = descriptor[ i ];
		} else if( descriptor[ i ] && typeof descriptor[ i ] == 'object' && ( descriptor[ i ].get || descriptor[ i ].set ) ) {
			Object.defineProperty( rVal.prototype, i , descriptor[ i ] );

			if( descriptor[ i ].get ) {
				rVal.prototype.$$getters[ i ] = descriptor[ i ].get;
				descriptor[ i ].get.$$name = i;
				descriptor[ i ].get.$$owner = rVal.prototype;
			}

			if( descriptor[ i ].set ) {
				rVal.prototype.$$setters[ i ] = descriptor[ i ].set;
				descriptor[ i ].set.$$name = i;
				descriptor[ i ].set.$$owner = rVal.prototype;	
			}
		} else {
			rVal.prototype[ i ] = descriptor[ i ];
		}
	}

	// this will be used to check if the caller function is the consructor
	rVal.$$isConstructor = true;


	// now we'll check interfaces
	for( var i = 1; i < arguments.length; i++ ) {
		arguments[ i ].compare( rVal );
	}

	return rVal;
};	

exports = module.exports = Class;
},{"./baseClass":9}],7:[function(require,module,exports){
var Class = require('./Class');

/**
The Enum class, which holds a set of constants in a fixed order.

#### Basic Usage:
	var Days = new Enum([ 
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			'Saturday',
			'Sunday'
	]);

	console.log( Days.Monday === Days.Tuesday ); // => false
	console.log( Days.values[1] ) // => the 'Tuesday' symbol object

Each enum *symbol* is an object which extends from the `{{#crossLink "Enum.Base"}}{{/crossLink}}` 
class. This base
class has  properties like `{{#crossLink "Enum.Base/value:property"}}{{/crossLink}}`  
and `{{#crossLink "Enum.Base/ordinal:property"}}{{/crossLink}}`. 
__`value`__ is a string
which matches the element of the array. __`ordinal`__ is the index the 
symbol was defined at in the enumeration. 

The resulting Enum object (in the above case, Days) also has some utility methods,
like fromValue(string) and the values property to access the array of symbols.

Note that the values array is frozen, as is each symbol. The returned object is 
__not__ frozen, as to allow the user to modify it (i.e. add "static" members).

A more advanced Enum usage is to specify a base Enum symbol class as the second
parameter. This is the class that each symbol will use. Then, if any symbols
are given as an Array (instead of string), it will be treated as an array of arguments
to the base class. The first argument should always be the desired key of that symbol.

Note that __`ordinal`__ is added dynamically
after the symbol is created; so it can't be used in the symbol's constructor.

#### Advanced Usage
	var Days = new Enum([ 
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			['Saturday', true],
			['Sunday', true]
		], new Class({
			
			Extends: Enum.Base,

			isWeekend: false,

			initialize: function( key, isWeekend ) {
				//pass the string value along to parent constructor
				this.parent( key ); 
				
				//get a boolean primitive out of the truthy/falsy value
				this.isWekeend = Boolean(isWeekend);
			}
		})
	);

	console.log( Days.Saturday.isWeekend ); // => true

This method will throw an error if you try to specify a class which does
not extend from `{{#crossLink "Enum.Base"}}{{/crossLink}}`.

#### Shorthand

You can also omit the `new Class` and pass a descriptor, thus reducing the need to 
explicitly require the Class module. Further, if you are passing a descriptor that
does not have `Extends` defined, it will default to
`{{#crossLink "Enum.Base"}}{{/crossLink}}`.

	var Icons = new Enum([ 
			'Open',
			'Save',
			'Help',
			'New'
		], {

			path: function( retina ) {
				return "icons/" + this.value.toLowerCase() + (retina ? "@2x" : "") + ".png";
			}
		}
	);


@class Enum
@constructor 
@param {Array} elements An array of enumerated constants, or arguments to be passed to the symbol
@param {Class} base Class to be instantiated for each enum symbol, must extend 
`{{#crossLink "Enum.Base"}}{{/crossLink}}`
*/
var EnumResult = new Class({

	/**
	An array of the enumerated symbol objects.

	@property values
	@type Array
	*/
	values: null,

	initialize: function () {
		this.values = [];
	},

	toString: function () {
		return "[ "+this.values.join(", ")+" ]";
	},

	/**
	Looks for the first symbol in this enum whose 'value' matches the specified string. 
	If none are found, this method returns null.

	@method fromValue
	@param {String} str the string to look up
	@return {Enum.Base} returns an enum symbol from the given 'value' string, or null
	*/
	fromValue: function (str) {
		for (var i=0; i<this.values.length; i++) {
			if (str === this.values[i].value)
				return this.values[i];
		}
		return null;
	}
});



var Enum = function ( elements, base ) {
	if (!base)
		base = Enum.Base;

	//The user is omitting Class, inject it here
	if (typeof base === "object") {
		//if we didn't specify a subclass.. 
		if (!base.Extends)
			base.Extends = Enum.Base;
		base = new Class(base);
	}
	
	var ret = new EnumResult();

	for (var i=0; i<elements.length; i++) {
		var e = elements[i];

		var obj = null;
		var key = null;

		if (!e)
			throw "enum value at index "+i+" is undefined";

		if (typeof e === "string") {
			key = e;
			obj = new base(e);
			ret[e] = obj;
		} else {
			if (!Array.isArray(e))
				throw "enum values must be String or an array of arguments";

			key = e[0];

			//first arg is ignored
			e.unshift(null);
			obj = new (Function.prototype.bind.apply(base, e));

			ret[key] = obj;
		}

		if ( !(obj instanceof Enum.Base) )
			throw "enum base class must be a subclass of Enum.Base";

		obj.ordinal = i;
		ret.values.push(obj);
		Object.freeze(obj);
	};

	//we SHOULD freeze the returrned object, but most JS developers
	//aren't expecting an object to be frozen, and the browsers don't always warn us.
	//It just causes frustration, e.g. if you're trying to add a static or constant
	//to the returned object.

	// Object.freeze(ret);
	Object.freeze(ret.values);
	return ret;
};


/**

The base type for Enum symbols. Subclasses can extend
this to implement more functionality for enum symbols.

@class Enum.Base
@constructor 
@param {String} key the string value for this symbol
*/
Enum.Base = new Class({

	/**
	The string value of this symbol.
	@property value
	@type String
	*/
	value: undefined,

	/**
	The index of this symbol in its enumeration array.
	@property ordinal
	@type Number
	*/
	ordinal: undefined,

	initialize: function ( key ) {
		this.value = key;
	},

	toString: function() {
		return this.value || this.parent();
	},

	valueOf: function() {
		return this.value || this.parent();
	}
});

exports = module.exports = Enum;

},{"./Class":6}],8:[function(require,module,exports){

var Interface = function( descriptor ) {
	this.descriptor = descriptor;
};

Interface.prototype.descriptor = null;

Interface.prototype.compare = function( classToCheck ) {

	for( var i  in this.descriptor ) {
		// First we'll check if this property exists on the class
		if( classToCheck.prototype[ i ] === undefined ) {

			throw 'INTERFACE ERROR: ' + i + ' is not defined in the class';

		// Second we'll check that the types expected match
		} else if( typeof this.descriptor[ i ] != typeof classToCheck.prototype[ i ] ) {

			throw 'INTERFACE ERROR: Interface and class define items of different type for ' + i + 
				  '\ninterface[ ' + i + ' ] == ' + typeof this.descriptor[ i ] +
				  '\nclass[ ' + i + ' ] == ' + typeof classToCheck.prototype[ i ];

		// Third if this property is a function we'll check that they expect the same amount of parameters
		} else if( typeof this.descriptor[ i ] == 'function' && classToCheck.prototype[ i ].length != this.descriptor[ i ].length ) {

			throw 'INTERFACE ERROR: Interface and class expect a different amount of parameters for the function ' + i +
				  '\nEXPECTED: ' + this.descriptor[ i ].length + 
				  '\nRECEIVED: ' + classToCheck.prototype[ i ].length;

		}
	}
};

exports = module.exports = Interface;
},{}],9:[function(require,module,exports){
//Exports a function named 'parent'
module.exports.parent = function() {
	// if the current function calling is the constructor
	if( this.parent.caller.$$isConstructor ) {
		var parentFunction = this.parent.caller.$$parentConstructor;
	} else {
		if( this.parent.caller.$$name ) {
			var callerName = this.parent.caller.$$name;
			var isGetter = this.parent.caller.$$owner.$$getters[ callerName ];
			var isSetter = this.parent.caller.$$owner.$$setters[ callerName ];

			if( arguments.length == 1 && isSetter ) {
				var parentFunction = Object.getPrototypeOf( this.parent.caller.$$owner ).$$setters[ callerName ];

				if( parentFunction === undefined ) {
					throw 'No setter defined in parent';
				}
			} else if( arguments.length == 0 && isGetter ) {
				var parentFunction = Object.getPrototypeOf( this.parent.caller.$$owner ).$$getters[ callerName ];

				if( parentFunction === undefined ) {
					throw 'No getter defined in parent';
				}
			} else if( isSetter || isGetter ) {
				throw 'Incorrect amount of arguments sent to getter or setter';
			} else {
				var parentFunction = Object.getPrototypeOf( this.parent.caller.$$owner )[ callerName ];	

				if( parentFunction === undefined ) {
					throw 'No parent function defined for ' + callerName;
				}
			}
		} else {
			throw 'You cannot call parent here';
		}
	}

	return parentFunction.apply( this, arguments );
};
},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2RlbW9zL3NyYy9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1NoYWRlclByb2dyYW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL2xpYi9XZWJHTENhbnZhcy5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvQ2xhc3MuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvRW51bS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2pzT09QL2xpYi9JbnRlcmZhY2UuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvYmFzZUNsYXNzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsidmFyIFdlYkdMQ2FudmFzID0gcmVxdWlyZSgna2FtaScpLldlYkdMQ2FudmFzO1xudmFyIFNoYWRlclByb2dyYW0gPSByZXF1aXJlKCdrYW1pJykuU2hhZGVyUHJvZ3JhbTtcblxuJChmdW5jdGlvbigpIHtcblx0dmFyIG1haW5Db250YWluZXIgPSAkKFwiYm9keVwiKS5jc3Moe1xuXHRcdGJhY2tncm91bmQ6IFwiIzAwMFwiXG5cdH0pO1xuXG5cdHZhciBkZW1vQ29udGFpbmVycyA9IFtdO1xuXHR2YXIgY3VycmVudERlbW8gPSBudWxsO1xuXHR2YXIgY3VycmVudEluZGV4ID0gMDtcblxuXG5cdHZhciB3aWR0aCA9IDgwMDtcblx0dmFyIGhlaWdodCA9IDYwMDtcblxuXHR2YXIgY2FudmFzID0gJChcIjxjYW52YXM+XCIsIHtcblx0XHR3aWR0aDogd2lkdGgsXG5cdFx0aGVpZ2h0OiBoZWlnaHRcblx0fSkuY3NzKHtcblx0XHRiYWNrZ3JvdW5kOiBcIiMzNDM0MzRcIiwgIFxuXHRcdHBvc2l0aW9uOiBcImZpeGVkXCIsXG5cdFx0dG9wOiAwLFxuXHRcdGxlZnQ6IDAsXG5cdFx0b3ZlcmZsb3c6IFwiaGlkZGVuXCJcblx0fSk7XG5cblx0Y2FudmFzLmFwcGVuZFRvKG1haW5Db250YWluZXIpO1xuXG5cblx0Ly8gdmFyIHJlbmRlcmVyID0gbmV3IFdlYkdMUmVuZGVyZXIod2lkdGgsIGhlaWdodCwgY2FudmFzWzBdKTtcblx0XG5cdHZhciBjb250ZXh0ID0gbmV3IFdlYkdMQ2FudmFzKDgwMCwgNjAwLCBudWxsLCB7XG5cdFx0YW50aWFsaWFzOiB0cnVlXHRcblx0fSk7XG4gIFx0XG5cdHZhciBzaGFkZXIgPSBuZXcgU2hhZGVyUHJvZ3JhbShjb250ZXh0LmdsLCAkKFwiI3ZlcnRfc2hhZGVyXCIpLmh0bWwoKSwgJChcIiNmcmFnX3NoYWRlclwiKS5odG1sKCkpO1xuXG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xuXG5cdGZ1bmN0aW9uIHJlbmRlcigpIHtcblx0XHRcblx0XHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUocmVuZGVyKTtcblx0fVxufSk7ICIsInZhciBDbGFzcyA9IHJlcXVpcmUoJ2pzT09QJykuQ2xhc3M7XG5cbnZhciBTaGFkZXJQcm9ncmFtID0gbmV3IENsYXNzKHtcblx0XG5cdHZlcnRTb3VyY2U6IG51bGwsXG5cdGZyYWdTb3VyY2U6IG51bGwsIFxuIFxuXHR2ZXJ0U2hhZGVyOiBudWxsLFxuXHRmcmFnU2hhZGVyOiBudWxsLFxuXG5cdHByb2dyYW06IG51bGwsXG5cblx0dW5pZm9ybUNhY2hlOiBudWxsLFxuXHRhdHRyaWJ1dGVDYWNoZTogbnVsbCxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbihnbCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0aWYgKCFnbClcblx0XHRcdHRocm93IFwibm8gR0wgY29udGV4dCBzcGVjaWZpZWRcIjtcblx0XHRpZiAoIXZlcnRTb3VyY2UgfHwgIWZyYWdTb3VyY2UpXG5cdFx0XHR0aHJvdyBcInZlcnRleCBhbmQgZnJhZ21lbnQgc2hhZGVycyBtdXN0IGJlIGRlZmluZWRcIjtcblxuXHRcdHRoaXMuZ2wgPSBnbDtcblxuXHRcdHRoaXMuYXR0cmliTG9jYXRpb25zID0gYXR0cmliTG9jYXRpb25zO1xuXG5cdFx0Ly9XZSB0cmltIChFQ01BU2NyaXB0NSkgc28gdGhhdCB0aGUgR0xTTCBsaW5lIG51bWJlcnMgYXJlXG5cdFx0Ly9hY2N1cmF0ZSBvbiBzaGFkZXIgbG9nXG5cdFx0dGhpcy52ZXJ0U291cmNlID0gdmVydFNvdXJjZS50cmltKCk7XG5cdFx0dGhpcy5mcmFnU291cmNlID0gZnJhZ1NvdXJjZS50cmltKCk7XG5cblx0XHR0aGlzLl9jb21waWxlU2hhZGVycygpO1xuXHR9LFxuXG5cdC8vQ29tcGlsZXMgdGhlIHNoYWRlcnMsIHRocm93aW5nIGFuIGVycm9yIGlmIHRoZSBwcm9ncmFtIHdhcyBpbnZhbGlkLlxuXHRfY29tcGlsZVNoYWRlcnM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7IFxuXG5cdFx0XG5cdFx0dGhpcy52ZXJ0U2hhZGVyID0gdGhpcy5fbG9hZFNoYWRlcihnbC5WRVJURVhfU0hBREVSLCB0aGlzLnZlcnRTb3VyY2UpO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSLCB0aGlzLmZyYWdTb3VyY2UpO1xuXG5cdFx0aWYgKCF0aGlzLnZlcnRTaGFkZXIgfHwgIXRoaXMuZnJhZ1NoYWRlcilcblx0XHRcdHRocm93IFwiRXJyb3IgcmV0dXJuZWQgd2hlbiBjYWxsaW5nIGNyZWF0ZVNoYWRlclwiO1xuXG5cdFx0dGhpcy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpO1xuXG5cdFx0aWYgKHRoaXMuYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gdGhpcy5hdHRyaWJMb2NhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuYXR0cmliTG9jYXRpb25zLmhhc093blByb3BlcnR5KGtleSkpXG5cdFx0ICAgIFx0XHRnbC5iaW5kQXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCB0aGlzLmF0dHJpYkxvY2F0aW9uc1trZXldLCBrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGdsLmF0dGFjaFNoYWRlcih0aGlzLnByb2dyYW0sIHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuYXR0YWNoU2hhZGVyKHRoaXMucHJvZ3JhbSwgdGhpcy5mcmFnU2hhZGVyKTtcblx0XHRnbC5saW5rUHJvZ3JhbSh0aGlzLnByb2dyYW0pOyBcblxuXHRcdGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xuXHRcdFx0dGhyb3cgXCJFcnJvciBsaW5raW5nIHRoZSBzaGFkZXIgcHJvZ3JhbTpcXG5cIlxuXHRcdFx0XHQrIGdsLmdldFByb2dyYW1JbmZvTG9nKHRoaXMucHJvZ3JhbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmV0Y2hVbmlmb3JtcygpO1xuXHRcdHRoaXMuX2ZldGNoQXR0cmlidXRlcygpO1xuXHRcdFxuXHRcdC8vIGZvciAodmFyIGsgaW4gdGhpcy51bmlmb3JtQ2FjaGUpXG5cdFx0Ly8gXHRjb25zb2xlLmxvZyhrLCB0aGlzLnVuaWZvcm1DYWNoZVtrXSlcblx0XHQvLyBmb3IgKHZhciBrIGluIHRoaXMuYXR0cmlidXRlQ2FjaGUpXG5cdFx0Ly8gXHRjb25zb2xlLmxvZyhrLCB0aGlzLmF0dHJpYnV0ZUNhY2hlW2tdKVxuXHR9LFxuXG5cdF9mZXRjaFVuaWZvcm1zOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy51bmlmb3JtQ2FjaGUgPSB7fTtcblxuXHRcdHZhciBsZW4gPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuQUNUSVZFX1VOSUZPUk1TKTtcblx0XHRpZiAoIWxlbikgLy9udWxsIG9yIHplcm9cblx0XHRcdHJldHVybjtcblxuXHRcdGZvciAodmFyIGk9MDsgaTxsZW47IGkrKykge1xuXHRcdFx0dmFyIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHRoaXMucHJvZ3JhbSwgaSk7XG5cdFx0XHRpZiAoaW5mbyA9PT0gbnVsbCkgXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0dmFyIG5hbWUgPSBpbmZvLm5hbWU7XG5cdFx0XHR2YXIgbG9jYXRpb24gPSBnbC5nZXRVbmlmb3JtTG9jYXRpb24odGhpcy5wcm9ncmFtLCBuYW1lKTtcblx0XHRcdFxuXHRcdFx0dGhpcy51bmlmb3JtQ2FjaGVbbmFtZV0gPSB7XG5cdFx0XHRcdHNpemU6IGluZm8uc2l6ZSxcblx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb25cblx0XHRcdH07XG5cdFx0fVxuXHR9LFxuXG5cdF9mZXRjaEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKCkgeyBcblx0XHR2YXIgZ2wgPSB0aGlzLmdsOyBcblxuXHRcdHRoaXMuYXR0cmlidXRlQ2FjaGUgPSB7fTtcblxuXHRcdHZhciBsZW4gPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuQUNUSVZFX0FUVFJJQlVURVMpO1xuXHRcdGlmICghbGVuKSAvL251bGwgb3IgemVyb1xuXHRcdFx0cmV0dXJuO1x0XG5cblx0XHRmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHtcblx0XHRcdHZhciBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHRoaXMucHJvZ3JhbSwgaSk7XG5cdFx0XHRpZiAoaW5mbyA9PT0gbnVsbCkgXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0dmFyIG5hbWUgPSBpbmZvLm5hbWU7XG5cblx0XHRcdC8vdGhlIGF0dHJpYiBsb2NhdGlvbiBpcyBhIHNpbXBsZSBpbmRleFxuXHRcdFx0dmFyIGxvY2F0aW9uID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCBuYW1lKTtcblx0XHRcdFxuXHRcdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXSA9IHtcblx0XHRcdFx0c2l6ZTogaW5mby5zaXplLFxuXHRcdFx0XHR0eXBlOiBpbmZvLnR5cGUsXG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvblxuXHRcdFx0fTtcblx0XHR9XG5cdH0sXG5cblx0X2xvYWRTaGFkZXI6IGZ1bmN0aW9uKHR5cGUsIHNvdXJjZSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpO1xuXHRcdGlmICghc2hhZGVyKSAvL3Nob3VsZCBub3Qgb2NjdXIuLi5cblx0XHRcdHJldHVybiAtMTtcblxuXHRcdGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSk7XG5cdFx0Z2wuY29tcGlsZVNoYWRlcihzaGFkZXIpO1xuXHRcdFxuXHRcdGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpICkge1xuXHRcdFx0dmFyIGxvZyA9IGdsLmdldFNoYWRlckluZm9Mb2coc2hhZGVyKTtcblx0XHRcdGlmIChsb2cgPT09IG51bGwpIC8vbWF5IHJldHVybiBudWxsIGFzIHBlciBXZWJHTCBzcGVjXG5cdFx0XHRcdGxvZyA9IFwiRXJyb3IgZXhlY3V0aW5nIGdldFNoYWRlckluZm9Mb2dcIjtcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvL3dlIGRvIHRoaXMgc28gdGhlIHVzZXIga25vd3Mgd2hpY2ggc2hhZGVyIGhhcyB0aGUgZXJyb3Jcblx0XHRcdFx0dmFyIHR5cGVTdHIgPSAodHlwZSA9PT0gZ2wuVkVSVEVYX1NIQURFUikgPyBcInZlcnRleFwiIDogXCJmcmFnbWVudFwiO1xuXHRcdFx0XHRsb2cgPSBcIkVycm9yIGNvbXBpbGluZyBcIisgdHlwZVN0cisgXCIgc2hhZGVyOlxcblwiK2xvZztcblx0XHRcdH1cblx0XHRcdHRocm93IGxvZztcblx0XHR9XG5cdFx0cmV0dXJuIHNoYWRlcjtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gaW5mbyAoc2l6ZSwgdHlwZSwgbG9jYXRpb24pLlxuXHQgKiBJZiB0aGUgdW5pZm9ybSBpcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLCBpdCBpcyBhc3N1bWVkXG5cdCAqIHRvIG5vdCBleGlzdCwgYW5kIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICpcblx0ICogVGhpcyBtYXkgcmV0dXJuIG51bGwgZXZlbiBpZiB0aGUgdW5pZm9ybSBpcyBkZWZpbmVkIGluIEdMU0w6XG5cdCAqIGlmIGl0IGlzIF9pbmFjdGl2ZV8gKGkuZS4gbm90IHVzZWQgaW4gdGhlIHByb2dyYW0pIHRoZW4gaXQgbWF5XG5cdCAqIGJlIG9wdGltaXplZCBvdXQuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7T2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSwgYW5kIHR5cGVcblx0ICovXG5cdGdldFVuaWZvcm1JbmZvOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMudW5pZm9ybUNhY2hlLmhhc093blByb3BlcnR5KG5hbWUpIFxuXHRcdFx0PyB0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSA6IG51bGw7IFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgYXR0cmlidXRlIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIGF0dHJpYnV0ZSBpcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLCBpdCBpcyBhc3N1bWVkXG5cdCAqIHRvIG5vdCBleGlzdCwgYW5kIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICpcblx0ICogVGhpcyBtYXkgcmV0dXJuIG51bGwgZXZlbiBpZiB0aGUgYXR0cmlidXRlIGlzIGRlZmluZWQgaW4gR0xTTDpcblx0ICogaWYgaXQgaXMgX2luYWN0aXZlXyAoaS5lLiBub3QgdXNlZCBpbiB0aGUgcHJvZ3JhbSBvciBkaXNhYmxlZCkgXG5cdCAqIHRoZW4gaXQgbWF5IGJlIG9wdGltaXplZCBvdXQuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtvYmplY3R9IGFuIG9iamVjdCBjb250YWluaW5nIGxvY2F0aW9uLCBzaXplIGFuZCB0eXBlXG5cdCAqL1xuXHRnZXRBdHRyaWJ1dGVJbmZvOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuYXR0cmlidXRlQ2FjaGUuaGFzT3duUHJvcGVydHkobmFtZSlcblx0XHRcdD8gdGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXSA6IG51bGw7XG5cdH0sXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gbG9jYXRpb24gb2JqZWN0LlxuXHQgKiBJZiB0aGUgdW5pZm9ybSBpcyBub3QgZm91bmQsIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtHTGludH0gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKi9cblx0Z2V0QXR0cmlidXRlTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5hdHRyaWJ1dGVDYWNoZS5oYXNPd25Qcm9wZXJ0eShuYW1lKSBcblx0XHRcdCYmIHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gIT09IG51bGxcblx0XHRcdFx0XHQ/IHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0ubG9jYXRpb24gXG5cdFx0XHRcdFx0OiBudWxsOyBcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gbG9jYXRpb24gb2JqZWN0LlxuXHQgKiBJZiB0aGUgdW5pZm9ybSBpcyBub3QgZm91bmQsIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtXZWJHTFVuaWZvcm1Mb2NhdGlvbn0gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKi9cblx0Z2V0VW5pZm9ybUxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMudW5pZm9ybUNhY2hlLmhhc093blByb3BlcnR5KG5hbWUpIFxuXHRcdFx0JiYgdGhpcy51bmlmb3JtQ2FjaGVbbmFtZV0gIT09IG51bGxcblx0XHRcdFx0XHQ/IHRoaXMudW5pZm9ybUNhY2hlW25hbWVdLmxvY2F0aW9uIFxuXHRcdFx0XHRcdDogbnVsbDsgXG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgdW5pZm9ybSBpcyBhY3RpdmUgYW5kIGZvdW5kIGluIHRoaXNcblx0ICogY29tcGlsZWQgcHJvZ3JhbS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gIG5hbWUgdGhlIHVuaWZvcm0gbmFtZVxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSB0cnVlIGlmIHRoZSB1bmlmb3JtIGlzIGZvdW5kIGFuZCBhY3RpdmVcblx0ICovXG5cdGhhc1VuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRVbmlmb3JtSW5mbyhuYW1lKSAhPT0gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBhdHRyaWJ1dGUgaXMgYWN0aXZlIGFuZCBmb3VuZCBpbiB0aGlzXG5cdCAqIGNvbXBpbGVkIHByb2dyYW0uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9ICBuYW1lIHRoZSBhdHRyaWJ1dGUgbmFtZVxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSB0cnVlIGlmIHRoZSBhdHRyaWJ1dGUgaXMgZm91bmQgYW5kIGFjdGl2ZVxuXHQgKi9cblx0aGFzQXR0cmlidXRlOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QXR0cmlidXRlSW5mbyhuYW1lKSAhPT0gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgdW5pZm9ybSB2YWx1ZSBieSBuYW1lLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge2FueX0gVGhlIHZhbHVlIG9mIHRoZSBXZWJHTCB1bmlmb3JtXG5cdCAqL1xuXHRnZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2wuZ2V0VW5pZm9ybSh0aGlzLnByb2dyYW0sIHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpKTtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgdW5pZm9ybSB2YWx1ZSBhdCB0aGUgc3BlY2lmaWVkIFdlYkdMVW5pZm9ybUxvY2F0aW9uLlxuXHQgKiBcblx0ICogQHBhcmFtICB7V2ViR0xVbmlmb3JtTG9jYXRpb259IGxvY2F0aW9uIHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICogQHJldHVybiB7YW55fSBUaGUgdmFsdWUgb2YgdGhlIFdlYkdMIHVuaWZvcm1cblx0ICovXG5cdGdldFVuaWZvcm1BdDogZnVuY3Rpb24obG9jYXRpb24pIHtcblx0XHRyZXR1cm4gdGhpcy5nbC5nZXRVbmlmb3JtKHRoaXMucHJvZ3JhbSwgbG9jYXRpb24pO1xuXHR9LFxuXHRcblx0c2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSwgdHlwZSwgYXJncykge1xuXHRcdC8vZmlyc3QgbG9vayBpbiBjYWNoZVxuXHRcdC8vaWYgbm90IGZvdW5kLFxuXHR9LFxuXG5cdGdldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblxuXHR9LFxuXG5cdHVzZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbC51c2VQcm9ncmFtKHRoaXMuc2hhZGVyUHJvZ3JhbSk7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy5mcmFnU2hhZGVyKTtcblxuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlUHJvZ3JhbSh0aGlzLnNoYWRlclByb2dyYW0pO1xuXHRcdHRoaXMuc2hhZGVyUHJvZ3JhbSA9IG51bGw7XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNoYWRlclByb2dyYW07IiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxudmFyIFdlYkdMQ2FudmFzID0gbmV3IENsYXNzKHtcblx0Ly9leHRlbmQgYSBiYXNlIGNsYXNzISFcdFxuXHRcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgdmlldywgY29udGV4dEF0dHJpYnV0ZXMpIHtcblx0XHQvL3NldHVwIGRlZmF1bHRzXG5cdFx0dGhpcy52aWV3ID0gdmlldyB8fCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuXG5cdFx0Ly9kZWZhdWx0IHNpemUgYXMgcGVyIHNwZWM6XG5cdFx0Ly9odHRwOi8vd3d3LnczLm9yZy9UUi8yMDEyL1dELWh0bWw1LWF1dGhvci0yMDEyMDMyOS90aGUtY2FudmFzLWVsZW1lbnQuaHRtbCN0aGUtY2FudmFzLWVsZW1lbnRcblx0XHR0aGlzLndpZHRoID0gdGhpcy52aWV3LndpZHRoID0gd2lkdGggfHwgMzAwO1xuXHRcdHRoaXMuaGVpZ2h0ID0gdGhpcy52aWV3LmhlaWdodCA9IGhlaWdodCB8fCAxNTA7XG5cblx0XHQvL3NldHVwIGNvbnRleHQgbG9zdCBhbmQgcmVzdG9yZSBsaXN0ZW5lcnNcblx0XHR0aGlzLnZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dGxvc3RcIiwgZnVuY3Rpb24gKGV2KSB7XG5cdFx0XHR0aGlzLl9jb250ZXh0TG9zdChldik7XG5cdFx0fS5iaW5kKHRoaXMpKTtcblx0XHR0aGlzLnZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dHJlc3RvcmVkXCIsIGZ1bmN0aW9uIChldikge1xuXHRcdFx0dGhpcy5fY29udGV4dFJlc3RvcmVkKGV2KTtcblx0XHR9LmJpbmQodGhpcykpO1xuXHRcdFxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmdsID0gdGhpcy52aWV3LmdldENvbnRleHQoXCJ3ZWJnbFwiLCBjb250ZXh0QXR0cmlidXRlcykgXG5cdFx0XHRcdFx0XHR8fCB0aGlzLnZpZXcuZ2V0Q29udGV4dChcImV4cGVyaW1lbnRhbC13ZWJnbFwiLCBjb250ZXh0QXR0cmlidXRlcyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3cgXCJXZWJHTCBDb250ZXh0IE5vdCBTdXBwb3J0ZWQgLS0gdHJ5IGVuYWJsaW5nIGl0IG9yIHVzaW5nIGEgZGlmZmVyZW50IGJyb3dzZXJcXG5cIlxuXHRcdFx0XHQrIGU7IC8vcHJpbnQgZXJyIG1zZ1xuXHRcdH1cblx0fSxcblxuXHRpbml0R0w6IGZ1bmN0aW9uKCkge1xuXG5cdH0sXG5cblx0X2NvbnRleHRMb3N0OiBmdW5jdGlvbihldikge1xuXG5cdH0sXG5cblx0X2NvbnRleHRSZXN0b3JlZDogZnVuY3Rpb24oZXYpIHtcblxuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXZWJHTENhbnZhczsiLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0U2hhZGVyUHJvZ3JhbTogcmVxdWlyZSgnLi9TaGFkZXJQcm9ncmFtLmpzJyksXG5cdFdlYkdMQ2FudmFzOiByZXF1aXJlKCcuL1dlYkdMQ2FudmFzLmpzJylcbn07IiwidmFyIENsYXNzID0gcmVxdWlyZSgnLi9saWIvQ2xhc3MnKSxcblx0RW51bSA9IHJlcXVpcmUoJy4vbGliL0VudW0nKSxcblx0SW50ZXJmYWNlID0gcmVxdWlyZSgnLi9saWIvSW50ZXJmYWNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuXHRDbGFzczogQ2xhc3MsXG5cdEVudW06IEVudW0sXG5cdEludGVyZmFjZTogSW50ZXJmYWNlXG59OyIsInZhciBCYXNlQ2xhc3MgPSByZXF1aXJlKCcuL2Jhc2VDbGFzcycpO1xuXG52YXIgQ2xhc3MgPSBmdW5jdGlvbiggZGVzY3JpcHRvciApIHtcblx0aWYgKCFkZXNjcmlwdG9yKSBcblx0XHRkZXNjcmlwdG9yID0ge307XG5cdFxuXHRpZiggZGVzY3JpcHRvci5pbml0aWFsaXplICkge1xuXHRcdHZhciByVmFsID0gZGVzY3JpcHRvci5pbml0aWFsaXplO1xuXHRcdGRlbGV0ZSBkZXNjcmlwdG9yLmluaXRpYWxpemU7XG5cdH0gZWxzZSB7XG5cdFx0clZhbCA9IGZ1bmN0aW9uKCkgeyB0aGlzLnBhcmVudC5hcHBseSggdGhpcywgYXJndW1lbnRzICk7IH07XG5cdH1cblxuXHRpZiggZGVzY3JpcHRvci5FeHRlbmRzICkge1xuXHRcdHJWYWwucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSggZGVzY3JpcHRvci5FeHRlbmRzLnByb3RvdHlwZSApO1xuXHRcdC8vIHRoaXMgd2lsbCBiZSB1c2VkIHRvIGNhbGwgdGhlIHBhcmVudCBjb25zdHJ1Y3RvclxuXHRcdHJWYWwuJCRwYXJlbnRDb25zdHJ1Y3RvciA9IGRlc2NyaXB0b3IuRXh0ZW5kcztcblx0XHRkZWxldGUgZGVzY3JpcHRvci5FeHRlbmRzO1xuXHR9IGVsc2Uge1xuXHRcdHJWYWwuJCRwYXJlbnRDb25zdHJ1Y3RvciA9IGZ1bmN0aW9uKCkge31cblx0XHRyVmFsLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoIEJhc2VDbGFzcyApO1xuXHR9XG5cblx0clZhbC5wcm90b3R5cGUuJCRnZXR0ZXJzID0ge307XG5cdHJWYWwucHJvdG90eXBlLiQkc2V0dGVycyA9IHt9O1xuXG5cdGZvciggdmFyIGkgaW4gZGVzY3JpcHRvciApIHtcblx0XHRpZiggdHlwZW9mIGRlc2NyaXB0b3JbIGkgXSA9PSAnZnVuY3Rpb24nICkge1xuXHRcdFx0ZGVzY3JpcHRvclsgaSBdLiQkbmFtZSA9IGk7XG5cdFx0XHRkZXNjcmlwdG9yWyBpIF0uJCRvd25lciA9IHJWYWwucHJvdG90eXBlO1xuXG5cdFx0XHRyVmFsLnByb3RvdHlwZVsgaSBdID0gZGVzY3JpcHRvclsgaSBdO1xuXHRcdH0gZWxzZSBpZiggZGVzY3JpcHRvclsgaSBdICYmIHR5cGVvZiBkZXNjcmlwdG9yWyBpIF0gPT0gJ29iamVjdCcgJiYgKCBkZXNjcmlwdG9yWyBpIF0uZ2V0IHx8IGRlc2NyaXB0b3JbIGkgXS5zZXQgKSApIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSggclZhbC5wcm90b3R5cGUsIGkgLCBkZXNjcmlwdG9yWyBpIF0gKTtcblxuXHRcdFx0aWYoIGRlc2NyaXB0b3JbIGkgXS5nZXQgKSB7XG5cdFx0XHRcdHJWYWwucHJvdG90eXBlLiQkZ2V0dGVyc1sgaSBdID0gZGVzY3JpcHRvclsgaSBdLmdldDtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLmdldC4kJG5hbWUgPSBpO1xuXHRcdFx0XHRkZXNjcmlwdG9yWyBpIF0uZ2V0LiQkb3duZXIgPSByVmFsLnByb3RvdHlwZTtcblx0XHRcdH1cblxuXHRcdFx0aWYoIGRlc2NyaXB0b3JbIGkgXS5zZXQgKSB7XG5cdFx0XHRcdHJWYWwucHJvdG90eXBlLiQkc2V0dGVyc1sgaSBdID0gZGVzY3JpcHRvclsgaSBdLnNldDtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLnNldC4kJG5hbWUgPSBpO1xuXHRcdFx0XHRkZXNjcmlwdG9yWyBpIF0uc2V0LiQkb3duZXIgPSByVmFsLnByb3RvdHlwZTtcdFxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyVmFsLnByb3RvdHlwZVsgaSBdID0gZGVzY3JpcHRvclsgaSBdO1xuXHRcdH1cblx0fVxuXG5cdC8vIHRoaXMgd2lsbCBiZSB1c2VkIHRvIGNoZWNrIGlmIHRoZSBjYWxsZXIgZnVuY3Rpb24gaXMgdGhlIGNvbnNydWN0b3Jcblx0clZhbC4kJGlzQ29uc3RydWN0b3IgPSB0cnVlO1xuXG5cblx0Ly8gbm93IHdlJ2xsIGNoZWNrIGludGVyZmFjZXNcblx0Zm9yKCB2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKysgKSB7XG5cdFx0YXJndW1lbnRzWyBpIF0uY29tcGFyZSggclZhbCApO1xuXHR9XG5cblx0cmV0dXJuIHJWYWw7XG59O1x0XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IENsYXNzOyIsInZhciBDbGFzcyA9IHJlcXVpcmUoJy4vQ2xhc3MnKTtcblxuLyoqXG5UaGUgRW51bSBjbGFzcywgd2hpY2ggaG9sZHMgYSBzZXQgb2YgY29uc3RhbnRzIGluIGEgZml4ZWQgb3JkZXIuXG5cbiMjIyMgQmFzaWMgVXNhZ2U6XG5cdHZhciBEYXlzID0gbmV3IEVudW0oWyBcblx0XHRcdCdNb25kYXknLFxuXHRcdFx0J1R1ZXNkYXknLFxuXHRcdFx0J1dlZG5lc2RheScsXG5cdFx0XHQnVGh1cnNkYXknLFxuXHRcdFx0J0ZyaWRheScsXG5cdFx0XHQnU2F0dXJkYXknLFxuXHRcdFx0J1N1bmRheSdcblx0XSk7XG5cblx0Y29uc29sZS5sb2coIERheXMuTW9uZGF5ID09PSBEYXlzLlR1ZXNkYXkgKTsgLy8gPT4gZmFsc2Vcblx0Y29uc29sZS5sb2coIERheXMudmFsdWVzWzFdICkgLy8gPT4gdGhlICdUdWVzZGF5JyBzeW1ib2wgb2JqZWN0XG5cbkVhY2ggZW51bSAqc3ltYm9sKiBpcyBhbiBvYmplY3Qgd2hpY2ggZXh0ZW5kcyBmcm9tIHRoZSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YCBcbmNsYXNzLiBUaGlzIGJhc2VcbmNsYXNzIGhhcyAgcHJvcGVydGllcyBsaWtlIGB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2UvdmFsdWU6cHJvcGVydHlcIn19e3svY3Jvc3NMaW5rfX1gICBcbmFuZCBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlL29yZGluYWw6cHJvcGVydHlcIn19e3svY3Jvc3NMaW5rfX1gLiBcbl9fYHZhbHVlYF9fIGlzIGEgc3RyaW5nXG53aGljaCBtYXRjaGVzIHRoZSBlbGVtZW50IG9mIHRoZSBhcnJheS4gX19gb3JkaW5hbGBfXyBpcyB0aGUgaW5kZXggdGhlIFxuc3ltYm9sIHdhcyBkZWZpbmVkIGF0IGluIHRoZSBlbnVtZXJhdGlvbi4gXG5cblRoZSByZXN1bHRpbmcgRW51bSBvYmplY3QgKGluIHRoZSBhYm92ZSBjYXNlLCBEYXlzKSBhbHNvIGhhcyBzb21lIHV0aWxpdHkgbWV0aG9kcyxcbmxpa2UgZnJvbVZhbHVlKHN0cmluZykgYW5kIHRoZSB2YWx1ZXMgcHJvcGVydHkgdG8gYWNjZXNzIHRoZSBhcnJheSBvZiBzeW1ib2xzLlxuXG5Ob3RlIHRoYXQgdGhlIHZhbHVlcyBhcnJheSBpcyBmcm96ZW4sIGFzIGlzIGVhY2ggc3ltYm9sLiBUaGUgcmV0dXJuZWQgb2JqZWN0IGlzIFxuX19ub3RfXyBmcm96ZW4sIGFzIHRvIGFsbG93IHRoZSB1c2VyIHRvIG1vZGlmeSBpdCAoaS5lLiBhZGQgXCJzdGF0aWNcIiBtZW1iZXJzKS5cblxuQSBtb3JlIGFkdmFuY2VkIEVudW0gdXNhZ2UgaXMgdG8gc3BlY2lmeSBhIGJhc2UgRW51bSBzeW1ib2wgY2xhc3MgYXMgdGhlIHNlY29uZFxucGFyYW1ldGVyLiBUaGlzIGlzIHRoZSBjbGFzcyB0aGF0IGVhY2ggc3ltYm9sIHdpbGwgdXNlLiBUaGVuLCBpZiBhbnkgc3ltYm9sc1xuYXJlIGdpdmVuIGFzIGFuIEFycmF5IChpbnN0ZWFkIG9mIHN0cmluZyksIGl0IHdpbGwgYmUgdHJlYXRlZCBhcyBhbiBhcnJheSBvZiBhcmd1bWVudHNcbnRvIHRoZSBiYXNlIGNsYXNzLiBUaGUgZmlyc3QgYXJndW1lbnQgc2hvdWxkIGFsd2F5cyBiZSB0aGUgZGVzaXJlZCBrZXkgb2YgdGhhdCBzeW1ib2wuXG5cbk5vdGUgdGhhdCBfX2BvcmRpbmFsYF9fIGlzIGFkZGVkIGR5bmFtaWNhbGx5XG5hZnRlciB0aGUgc3ltYm9sIGlzIGNyZWF0ZWQ7IHNvIGl0IGNhbid0IGJlIHVzZWQgaW4gdGhlIHN5bWJvbCdzIGNvbnN0cnVjdG9yLlxuXG4jIyMjIEFkdmFuY2VkIFVzYWdlXG5cdHZhciBEYXlzID0gbmV3IEVudW0oWyBcblx0XHRcdCdNb25kYXknLFxuXHRcdFx0J1R1ZXNkYXknLFxuXHRcdFx0J1dlZG5lc2RheScsXG5cdFx0XHQnVGh1cnNkYXknLFxuXHRcdFx0J0ZyaWRheScsXG5cdFx0XHRbJ1NhdHVyZGF5JywgdHJ1ZV0sXG5cdFx0XHRbJ1N1bmRheScsIHRydWVdXG5cdFx0XSwgbmV3IENsYXNzKHtcblx0XHRcdFxuXHRcdFx0RXh0ZW5kczogRW51bS5CYXNlLFxuXG5cdFx0XHRpc1dlZWtlbmQ6IGZhbHNlLFxuXG5cdFx0XHRpbml0aWFsaXplOiBmdW5jdGlvbigga2V5LCBpc1dlZWtlbmQgKSB7XG5cdFx0XHRcdC8vcGFzcyB0aGUgc3RyaW5nIHZhbHVlIGFsb25nIHRvIHBhcmVudCBjb25zdHJ1Y3RvclxuXHRcdFx0XHR0aGlzLnBhcmVudCgga2V5ICk7IFxuXHRcdFx0XHRcblx0XHRcdFx0Ly9nZXQgYSBib29sZWFuIHByaW1pdGl2ZSBvdXQgb2YgdGhlIHRydXRoeS9mYWxzeSB2YWx1ZVxuXHRcdFx0XHR0aGlzLmlzV2VrZWVuZCA9IEJvb2xlYW4oaXNXZWVrZW5kKTtcblx0XHRcdH1cblx0XHR9KVxuXHQpO1xuXG5cdGNvbnNvbGUubG9nKCBEYXlzLlNhdHVyZGF5LmlzV2Vla2VuZCApOyAvLyA9PiB0cnVlXG5cblRoaXMgbWV0aG9kIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBzcGVjaWZ5IGEgY2xhc3Mgd2hpY2ggZG9lc1xubm90IGV4dGVuZCBmcm9tIGB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2VcIn19e3svY3Jvc3NMaW5rfX1gLlxuXG4jIyMjIFNob3J0aGFuZFxuXG5Zb3UgY2FuIGFsc28gb21pdCB0aGUgYG5ldyBDbGFzc2AgYW5kIHBhc3MgYSBkZXNjcmlwdG9yLCB0aHVzIHJlZHVjaW5nIHRoZSBuZWVkIHRvIFxuZXhwbGljaXRseSByZXF1aXJlIHRoZSBDbGFzcyBtb2R1bGUuIEZ1cnRoZXIsIGlmIHlvdSBhcmUgcGFzc2luZyBhIGRlc2NyaXB0b3IgdGhhdFxuZG9lcyBub3QgaGF2ZSBgRXh0ZW5kc2AgZGVmaW5lZCwgaXQgd2lsbCBkZWZhdWx0IHRvXG5ge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YC5cblxuXHR2YXIgSWNvbnMgPSBuZXcgRW51bShbIFxuXHRcdFx0J09wZW4nLFxuXHRcdFx0J1NhdmUnLFxuXHRcdFx0J0hlbHAnLFxuXHRcdFx0J05ldydcblx0XHRdLCB7XG5cblx0XHRcdHBhdGg6IGZ1bmN0aW9uKCByZXRpbmEgKSB7XG5cdFx0XHRcdHJldHVybiBcImljb25zL1wiICsgdGhpcy52YWx1ZS50b0xvd2VyQ2FzZSgpICsgKHJldGluYSA/IFwiQDJ4XCIgOiBcIlwiKSArIFwiLnBuZ1wiO1xuXHRcdFx0fVxuXHRcdH1cblx0KTtcblxuXG5AY2xhc3MgRW51bVxuQGNvbnN0cnVjdG9yIFxuQHBhcmFtIHtBcnJheX0gZWxlbWVudHMgQW4gYXJyYXkgb2YgZW51bWVyYXRlZCBjb25zdGFudHMsIG9yIGFyZ3VtZW50cyB0byBiZSBwYXNzZWQgdG8gdGhlIHN5bWJvbFxuQHBhcmFtIHtDbGFzc30gYmFzZSBDbGFzcyB0byBiZSBpbnN0YW50aWF0ZWQgZm9yIGVhY2ggZW51bSBzeW1ib2wsIG11c3QgZXh0ZW5kIFxuYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWBcbiovXG52YXIgRW51bVJlc3VsdCA9IG5ldyBDbGFzcyh7XG5cblx0LyoqXG5cdEFuIGFycmF5IG9mIHRoZSBlbnVtZXJhdGVkIHN5bWJvbCBvYmplY3RzLlxuXG5cdEBwcm9wZXJ0eSB2YWx1ZXNcblx0QHR5cGUgQXJyYXlcblx0Ki9cblx0dmFsdWVzOiBudWxsLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnZhbHVlcyA9IFtdO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIFwiWyBcIit0aGlzLnZhbHVlcy5qb2luKFwiLCBcIikrXCIgXVwiO1xuXHR9LFxuXG5cdC8qKlxuXHRMb29rcyBmb3IgdGhlIGZpcnN0IHN5bWJvbCBpbiB0aGlzIGVudW0gd2hvc2UgJ3ZhbHVlJyBtYXRjaGVzIHRoZSBzcGVjaWZpZWQgc3RyaW5nLiBcblx0SWYgbm9uZSBhcmUgZm91bmQsIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblxuXHRAbWV0aG9kIGZyb21WYWx1ZVxuXHRAcGFyYW0ge1N0cmluZ30gc3RyIHRoZSBzdHJpbmcgdG8gbG9vayB1cFxuXHRAcmV0dXJuIHtFbnVtLkJhc2V9IHJldHVybnMgYW4gZW51bSBzeW1ib2wgZnJvbSB0aGUgZ2l2ZW4gJ3ZhbHVlJyBzdHJpbmcsIG9yIG51bGxcblx0Ki9cblx0ZnJvbVZhbHVlOiBmdW5jdGlvbiAoc3RyKSB7XG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMudmFsdWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoc3RyID09PSB0aGlzLnZhbHVlc1tpXS52YWx1ZSlcblx0XHRcdFx0cmV0dXJuIHRoaXMudmFsdWVzW2ldO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufSk7XG5cblxuXG52YXIgRW51bSA9IGZ1bmN0aW9uICggZWxlbWVudHMsIGJhc2UgKSB7XG5cdGlmICghYmFzZSlcblx0XHRiYXNlID0gRW51bS5CYXNlO1xuXG5cdC8vVGhlIHVzZXIgaXMgb21pdHRpbmcgQ2xhc3MsIGluamVjdCBpdCBoZXJlXG5cdGlmICh0eXBlb2YgYmFzZSA9PT0gXCJvYmplY3RcIikge1xuXHRcdC8vaWYgd2UgZGlkbid0IHNwZWNpZnkgYSBzdWJjbGFzcy4uIFxuXHRcdGlmICghYmFzZS5FeHRlbmRzKVxuXHRcdFx0YmFzZS5FeHRlbmRzID0gRW51bS5CYXNlO1xuXHRcdGJhc2UgPSBuZXcgQ2xhc3MoYmFzZSk7XG5cdH1cblx0XG5cdHZhciByZXQgPSBuZXcgRW51bVJlc3VsdCgpO1xuXG5cdGZvciAodmFyIGk9MDsgaTxlbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdHZhciBlID0gZWxlbWVudHNbaV07XG5cblx0XHR2YXIgb2JqID0gbnVsbDtcblx0XHR2YXIga2V5ID0gbnVsbDtcblxuXHRcdGlmICghZSlcblx0XHRcdHRocm93IFwiZW51bSB2YWx1ZSBhdCBpbmRleCBcIitpK1wiIGlzIHVuZGVmaW5lZFwiO1xuXG5cdFx0aWYgKHR5cGVvZiBlID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRrZXkgPSBlO1xuXHRcdFx0b2JqID0gbmV3IGJhc2UoZSk7XG5cdFx0XHRyZXRbZV0gPSBvYmo7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShlKSlcblx0XHRcdFx0dGhyb3cgXCJlbnVtIHZhbHVlcyBtdXN0IGJlIFN0cmluZyBvciBhbiBhcnJheSBvZiBhcmd1bWVudHNcIjtcblxuXHRcdFx0a2V5ID0gZVswXTtcblxuXHRcdFx0Ly9maXJzdCBhcmcgaXMgaWdub3JlZFxuXHRcdFx0ZS51bnNoaWZ0KG51bGwpO1xuXHRcdFx0b2JqID0gbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShiYXNlLCBlKSk7XG5cblx0XHRcdHJldFtrZXldID0gb2JqO1xuXHRcdH1cblxuXHRcdGlmICggIShvYmogaW5zdGFuY2VvZiBFbnVtLkJhc2UpIClcblx0XHRcdHRocm93IFwiZW51bSBiYXNlIGNsYXNzIG11c3QgYmUgYSBzdWJjbGFzcyBvZiBFbnVtLkJhc2VcIjtcblxuXHRcdG9iai5vcmRpbmFsID0gaTtcblx0XHRyZXQudmFsdWVzLnB1c2gob2JqKTtcblx0XHRPYmplY3QuZnJlZXplKG9iaik7XG5cdH07XG5cblx0Ly93ZSBTSE9VTEQgZnJlZXplIHRoZSByZXR1cnJuZWQgb2JqZWN0LCBidXQgbW9zdCBKUyBkZXZlbG9wZXJzXG5cdC8vYXJlbid0IGV4cGVjdGluZyBhbiBvYmplY3QgdG8gYmUgZnJvemVuLCBhbmQgdGhlIGJyb3dzZXJzIGRvbid0IGFsd2F5cyB3YXJuIHVzLlxuXHQvL0l0IGp1c3QgY2F1c2VzIGZydXN0cmF0aW9uLCBlLmcuIGlmIHlvdSdyZSB0cnlpbmcgdG8gYWRkIGEgc3RhdGljIG9yIGNvbnN0YW50XG5cdC8vdG8gdGhlIHJldHVybmVkIG9iamVjdC5cblxuXHQvLyBPYmplY3QuZnJlZXplKHJldCk7XG5cdE9iamVjdC5mcmVlemUocmV0LnZhbHVlcyk7XG5cdHJldHVybiByZXQ7XG59O1xuXG5cbi8qKlxuXG5UaGUgYmFzZSB0eXBlIGZvciBFbnVtIHN5bWJvbHMuIFN1YmNsYXNzZXMgY2FuIGV4dGVuZFxudGhpcyB0byBpbXBsZW1lbnQgbW9yZSBmdW5jdGlvbmFsaXR5IGZvciBlbnVtIHN5bWJvbHMuXG5cbkBjbGFzcyBFbnVtLkJhc2VcbkBjb25zdHJ1Y3RvciBcbkBwYXJhbSB7U3RyaW5nfSBrZXkgdGhlIHN0cmluZyB2YWx1ZSBmb3IgdGhpcyBzeW1ib2xcbiovXG5FbnVtLkJhc2UgPSBuZXcgQ2xhc3Moe1xuXG5cdC8qKlxuXHRUaGUgc3RyaW5nIHZhbHVlIG9mIHRoaXMgc3ltYm9sLlxuXHRAcHJvcGVydHkgdmFsdWVcblx0QHR5cGUgU3RyaW5nXG5cdCovXG5cdHZhbHVlOiB1bmRlZmluZWQsXG5cblx0LyoqXG5cdFRoZSBpbmRleCBvZiB0aGlzIHN5bWJvbCBpbiBpdHMgZW51bWVyYXRpb24gYXJyYXkuXG5cdEBwcm9wZXJ0eSBvcmRpbmFsXG5cdEB0eXBlIE51bWJlclxuXHQqL1xuXHRvcmRpbmFsOiB1bmRlZmluZWQsXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKCBrZXkgKSB7XG5cdFx0dGhpcy52YWx1ZSA9IGtleTtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgfHwgdGhpcy5wYXJlbnQoKTtcblx0fSxcblxuXHR2YWx1ZU9mOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZSB8fCB0aGlzLnBhcmVudCgpO1xuXHR9XG59KTtcblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRW51bTtcbiIsIlxudmFyIEludGVyZmFjZSA9IGZ1bmN0aW9uKCBkZXNjcmlwdG9yICkge1xuXHR0aGlzLmRlc2NyaXB0b3IgPSBkZXNjcmlwdG9yO1xufTtcblxuSW50ZXJmYWNlLnByb3RvdHlwZS5kZXNjcmlwdG9yID0gbnVsbDtcblxuSW50ZXJmYWNlLnByb3RvdHlwZS5jb21wYXJlID0gZnVuY3Rpb24oIGNsYXNzVG9DaGVjayApIHtcblxuXHRmb3IoIHZhciBpICBpbiB0aGlzLmRlc2NyaXB0b3IgKSB7XG5cdFx0Ly8gRmlyc3Qgd2UnbGwgY2hlY2sgaWYgdGhpcyBwcm9wZXJ0eSBleGlzdHMgb24gdGhlIGNsYXNzXG5cdFx0aWYoIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXSA9PT0gdW5kZWZpbmVkICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiAnICsgaSArICcgaXMgbm90IGRlZmluZWQgaW4gdGhlIGNsYXNzJztcblxuXHRcdC8vIFNlY29uZCB3ZSdsbCBjaGVjayB0aGF0IHRoZSB0eXBlcyBleHBlY3RlZCBtYXRjaFxuXHRcdH0gZWxzZSBpZiggdHlwZW9mIHRoaXMuZGVzY3JpcHRvclsgaSBdICE9IHR5cGVvZiBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0gKSB7XG5cblx0XHRcdHRocm93ICdJTlRFUkZBQ0UgRVJST1I6IEludGVyZmFjZSBhbmQgY2xhc3MgZGVmaW5lIGl0ZW1zIG9mIGRpZmZlcmVudCB0eXBlIGZvciAnICsgaSArIFxuXHRcdFx0XHQgICdcXG5pbnRlcmZhY2VbICcgKyBpICsgJyBdID09ICcgKyB0eXBlb2YgdGhpcy5kZXNjcmlwdG9yWyBpIF0gK1xuXHRcdFx0XHQgICdcXG5jbGFzc1sgJyArIGkgKyAnIF0gPT0gJyArIHR5cGVvZiBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF07XG5cblx0XHQvLyBUaGlyZCBpZiB0aGlzIHByb3BlcnR5IGlzIGEgZnVuY3Rpb24gd2UnbGwgY2hlY2sgdGhhdCB0aGV5IGV4cGVjdCB0aGUgc2FtZSBhbW91bnQgb2YgcGFyYW1ldGVyc1xuXHRcdH0gZWxzZSBpZiggdHlwZW9mIHRoaXMuZGVzY3JpcHRvclsgaSBdID09ICdmdW5jdGlvbicgJiYgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdLmxlbmd0aCAhPSB0aGlzLmRlc2NyaXB0b3JbIGkgXS5sZW5ndGggKSB7XG5cblx0XHRcdHRocm93ICdJTlRFUkZBQ0UgRVJST1I6IEludGVyZmFjZSBhbmQgY2xhc3MgZXhwZWN0IGEgZGlmZmVyZW50IGFtb3VudCBvZiBwYXJhbWV0ZXJzIGZvciB0aGUgZnVuY3Rpb24gJyArIGkgK1xuXHRcdFx0XHQgICdcXG5FWFBFQ1RFRDogJyArIHRoaXMuZGVzY3JpcHRvclsgaSBdLmxlbmd0aCArIFxuXHRcdFx0XHQgICdcXG5SRUNFSVZFRDogJyArIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXS5sZW5ndGg7XG5cblx0XHR9XG5cdH1cbn07XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEludGVyZmFjZTsiLCIvL0V4cG9ydHMgYSBmdW5jdGlvbiBuYW1lZCAncGFyZW50J1xubW9kdWxlLmV4cG9ydHMucGFyZW50ID0gZnVuY3Rpb24oKSB7XG5cdC8vIGlmIHRoZSBjdXJyZW50IGZ1bmN0aW9uIGNhbGxpbmcgaXMgdGhlIGNvbnN0cnVjdG9yXG5cdGlmKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRpc0NvbnN0cnVjdG9yICkge1xuXHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IHRoaXMucGFyZW50LmNhbGxlci4kJHBhcmVudENvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGlmKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRuYW1lICkge1xuXHRcdFx0dmFyIGNhbGxlck5hbWUgPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRuYW1lO1xuXHRcdFx0dmFyIGlzR2V0dGVyID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIuJCRnZXR0ZXJzWyBjYWxsZXJOYW1lIF07XG5cdFx0XHR2YXIgaXNTZXR0ZXIgPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lci4kJHNldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0aWYoIGFyZ3VtZW50cy5sZW5ndGggPT0gMSAmJiBpc1NldHRlciApIHtcblx0XHRcdFx0dmFyIHBhcmVudEZ1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lciApLiQkc2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXG5cdFx0XHRcdGlmKCBwYXJlbnRGdW5jdGlvbiA9PT0gdW5kZWZpbmVkICkge1xuXHRcdFx0XHRcdHRocm93ICdObyBzZXR0ZXIgZGVmaW5lZCBpbiBwYXJlbnQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYoIGFyZ3VtZW50cy5sZW5ndGggPT0gMCAmJiBpc0dldHRlciApIHtcblx0XHRcdFx0dmFyIHBhcmVudEZ1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lciApLiQkZ2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXG5cdFx0XHRcdGlmKCBwYXJlbnRGdW5jdGlvbiA9PT0gdW5kZWZpbmVkICkge1xuXHRcdFx0XHRcdHRocm93ICdObyBnZXR0ZXIgZGVmaW5lZCBpbiBwYXJlbnQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYoIGlzU2V0dGVyIHx8IGlzR2V0dGVyICkge1xuXHRcdFx0XHR0aHJvdyAnSW5jb3JyZWN0IGFtb3VudCBvZiBhcmd1bWVudHMgc2VudCB0byBnZXR0ZXIgb3Igc2V0dGVyJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKVsgY2FsbGVyTmFtZSBdO1x0XG5cblx0XHRcdFx0aWYoIHBhcmVudEZ1bmN0aW9uID09PSB1bmRlZmluZWQgKSB7XG5cdFx0XHRcdFx0dGhyb3cgJ05vIHBhcmVudCBmdW5jdGlvbiBkZWZpbmVkIGZvciAnICsgY2FsbGVyTmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyAnWW91IGNhbm5vdCBjYWxsIHBhcmVudCBoZXJlJztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcGFyZW50RnVuY3Rpb24uYXBwbHkoIHRoaXMsIGFyZ3VtZW50cyApO1xufTsiXX0=
;