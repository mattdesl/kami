;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var WebGLCanvas = require('kami/lib/WebGLCanvas');
var ShaderProgram = require('kami/lib/ShaderProgram');

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


	var shader = new ShaderProgram($("#vert_shader").html(), $("#frag_shader").html());

	requestAnimationFrame(render);

	function render() {
		
		requestAnimationFrame(render);
	}
}); 
},{"kami/lib/ShaderProgram":2,"kami/lib/WebGLCanvas":3}],2:[function(require,module,exports){
var Class = require('jsOOP').Class;

var ShaderProgram = new Class({
	
	vertSource: null,
	fragSource: null, 
 
	vertShader: null,
	fragShader: null,

	program: null,

	initialize: function(gl, vertSource, fragSource, attribLocations) {
		this.gl = gl;
		this.vertSource = vertSource;
		this.fragSource = fragSource;

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

		if (attribLocations) {
			for (var key in attribLocations) {
				if (attribLocations.hasOwnProperty(key))
		    		gl.bindAttribLocation(this.program, attribLocations[key], key);
			}
		}

		gl.linkProgram(this.program);

		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS))
			throw gl.getProgramInfoLog(this.program);
	},

	_loadShader: function(type, source) {
		var gl = this.gl;
		var shader = gl.createShader(type);
		if (!shader) //should not occur...
			return -1;

		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw gl.getShaderInfoLog(shader);
		}
		return shader;
	},
	
	setUniform: function(name, type, args) {
		//first look in cache
		//if not found,
	},

	getUniform: function(name) {

	},


	//Checks the cache to see if we've already saved 
	getUniformLocation: function(name) {
		//this.gl.getUniformLocation(this.shaderProgram, name);
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
},{"jsOOP":4}],3:[function(require,module,exports){
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
},{"jsOOP":4}],4:[function(require,module,exports){
var Class = require('./lib/Class'),
	Enum = require('./lib/Enum'),
	Interface = require('./lib/Interface');

module.exports = {
	Class: Class,
	Enum: Enum,
	Interface: Interface
};
},{"./lib/Class":5,"./lib/Enum":6,"./lib/Interface":7}],5:[function(require,module,exports){
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
},{"./baseClass":8}],6:[function(require,module,exports){
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

},{"./Class":5}],7:[function(require,module,exports){

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
},{}],8:[function(require,module,exports){
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2RlbW9zL3NyYy9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1NoYWRlclByb2dyYW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL2xpYi9XZWJHTENhbnZhcy5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2pzT09QL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvbGliL0NsYXNzLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvbGliL0VudW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvSW50ZXJmYWNlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvbGliL2Jhc2VDbGFzcy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDek9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgV2ViR0xDYW52YXMgPSByZXF1aXJlKCdrYW1pL2xpYi9XZWJHTENhbnZhcycpO1xudmFyIFNoYWRlclByb2dyYW0gPSByZXF1aXJlKCdrYW1pL2xpYi9TaGFkZXJQcm9ncmFtJyk7XG5cbiQoZnVuY3Rpb24oKSB7XG5cdHZhciBtYWluQ29udGFpbmVyID0gJChcImJvZHlcIikuY3NzKHtcblx0XHRiYWNrZ3JvdW5kOiBcIiMwMDBcIlxuXHR9KTtcblxuXHR2YXIgZGVtb0NvbnRhaW5lcnMgPSBbXTtcblx0dmFyIGN1cnJlbnREZW1vID0gbnVsbDtcblx0dmFyIGN1cnJlbnRJbmRleCA9IDA7XG5cblxuXHR2YXIgd2lkdGggPSA4MDA7XG5cdHZhciBoZWlnaHQgPSA2MDA7XG5cblx0dmFyIGNhbnZhcyA9ICQoXCI8Y2FudmFzPlwiLCB7XG5cdFx0d2lkdGg6IHdpZHRoLFxuXHRcdGhlaWdodDogaGVpZ2h0XG5cdH0pLmNzcyh7XG5cdFx0YmFja2dyb3VuZDogXCIjMzQzNDM0XCIsICBcblx0XHRwb3NpdGlvbjogXCJmaXhlZFwiLFxuXHRcdHRvcDogMCxcblx0XHRsZWZ0OiAwLFxuXHRcdG92ZXJmbG93OiBcImhpZGRlblwiXG5cdH0pO1xuXG5cdGNhbnZhcy5hcHBlbmRUbyhtYWluQ29udGFpbmVyKTtcblxuXG5cdC8vIHZhciByZW5kZXJlciA9IG5ldyBXZWJHTFJlbmRlcmVyKHdpZHRoLCBoZWlnaHQsIGNhbnZhc1swXSk7XG5cdFxuXHR2YXIgY29udGV4dCA9IG5ldyBXZWJHTENhbnZhcyg4MDAsIDYwMCwgbnVsbCwge1xuXHRcdGFudGlhbGlhczogdHJ1ZVx0XG5cdH0pO1xuXG5cblx0dmFyIHNoYWRlciA9IG5ldyBTaGFkZXJQcm9ncmFtKCQoXCIjdmVydF9zaGFkZXJcIikuaHRtbCgpLCAkKFwiI2ZyYWdfc2hhZGVyXCIpLmh0bWwoKSk7XG5cblx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlbmRlcik7XG5cblx0ZnVuY3Rpb24gcmVuZGVyKCkge1xuXHRcdFxuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xuXHR9XG59KTsgIiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxudmFyIFNoYWRlclByb2dyYW0gPSBuZXcgQ2xhc3Moe1xuXHRcblx0dmVydFNvdXJjZTogbnVsbCxcblx0ZnJhZ1NvdXJjZTogbnVsbCwgXG4gXG5cdHZlcnRTaGFkZXI6IG51bGwsXG5cdGZyYWdTaGFkZXI6IG51bGwsXG5cblx0cHJvZ3JhbTogbnVsbCxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbihnbCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0dGhpcy5nbCA9IGdsO1xuXHRcdHRoaXMudmVydFNvdXJjZSA9IHZlcnRTb3VyY2U7XG5cdFx0dGhpcy5mcmFnU291cmNlID0gZnJhZ1NvdXJjZTtcblxuXHRcdHRoaXMuX2NvbXBpbGVTaGFkZXJzKCk7XG5cdH0sXG5cblx0Ly9Db21waWxlcyB0aGUgc2hhZGVycywgdGhyb3dpbmcgYW4gZXJyb3IgaWYgdGhlIHByb2dyYW0gd2FzIGludmFsaWQuXG5cdF9jb21waWxlU2hhZGVyczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cdFx0dGhpcy52ZXJ0U2hhZGVyID0gdGhpcy5fbG9hZFNoYWRlcihnbC5WRVJURVhfU0hBREVSLCB0aGlzLnZlcnRTb3VyY2UpO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSLCB0aGlzLmZyYWdTb3VyY2UpO1xuXG5cdFx0aWYgKCF0aGlzLnZlcnRTaGFkZXIgfHwgIXRoaXMuZnJhZ1NoYWRlcilcblx0XHRcdHRocm93IFwiRXJyb3IgcmV0dXJuZWQgd2hlbiBjYWxsaW5nIGNyZWF0ZVNoYWRlclwiO1xuXG5cdFx0dGhpcy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpO1xuXG5cdFx0aWYgKGF0dHJpYkxvY2F0aW9ucykge1xuXHRcdFx0Zm9yICh2YXIga2V5IGluIGF0dHJpYkxvY2F0aW9ucykge1xuXHRcdFx0XHRpZiAoYXR0cmliTG9jYXRpb25zLmhhc093blByb3BlcnR5KGtleSkpXG5cdFx0ICAgIFx0XHRnbC5iaW5kQXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCBhdHRyaWJMb2NhdGlvbnNba2V5XSwga2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRnbC5saW5rUHJvZ3JhbSh0aGlzLnByb2dyYW0pO1xuXG5cdFx0aWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHNoYWRlclByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSlcblx0XHRcdHRocm93IGdsLmdldFByb2dyYW1JbmZvTG9nKHRoaXMucHJvZ3JhbSk7XG5cdH0sXG5cblx0X2xvYWRTaGFkZXI6IGZ1bmN0aW9uKHR5cGUsIHNvdXJjZSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcblx0XHRpZiAoIXNoYWRlcikgLy9zaG91bGQgbm90IG9jY3VyLi4uXG5cdFx0XHRyZXR1cm4gLTE7XG5cblx0XHRnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpO1xuXHRcdGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKTtcblx0XHRcblx0XHRpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihzaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSkge1xuXHRcdFx0dGhyb3cgZ2wuZ2V0U2hhZGVySW5mb0xvZyhzaGFkZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2hhZGVyO1xuXHR9LFxuXHRcblx0c2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSwgdHlwZSwgYXJncykge1xuXHRcdC8vZmlyc3QgbG9vayBpbiBjYWNoZVxuXHRcdC8vaWYgbm90IGZvdW5kLFxuXHR9LFxuXG5cdGdldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblxuXHR9LFxuXG5cblx0Ly9DaGVja3MgdGhlIGNhY2hlIHRvIHNlZSBpZiB3ZSd2ZSBhbHJlYWR5IHNhdmVkIFxuXHRnZXRVbmlmb3JtTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHQvL3RoaXMuZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHRoaXMuc2hhZGVyUHJvZ3JhbSwgbmFtZSk7XG5cdH0sXG5cblx0dXNlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsLnVzZVByb2dyYW0odGhpcy5zaGFkZXJQcm9ncmFtKTtcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMuZnJhZ1NoYWRlcik7XG5cblx0XHRnbC5kZWxldGVQcm9ncmFtKHRoaXMuc2hhZGVyUHJvZ3JhbSk7XG5cdFx0dGhpcy5zaGFkZXJQcm9ncmFtID0gbnVsbDtcblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hhZGVyUHJvZ3JhbTsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCdqc09PUCcpLkNsYXNzO1xuXG52YXIgV2ViR0xDYW52YXMgPSBuZXcgQ2xhc3Moe1xuXHQvL2V4dGVuZCBhIGJhc2UgY2xhc3MhIVx0XG5cdFxuXHRpbml0aWFsaXplOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0LCB2aWV3LCBjb250ZXh0QXR0cmlidXRlcykge1xuXHRcdC8vc2V0dXAgZGVmYXVsdHNcblx0XHR0aGlzLnZpZXcgPSB2aWV3IHx8IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG5cblx0XHQvL2RlZmF1bHQgc2l6ZSBhcyBwZXIgc3BlYzpcblx0XHQvL2h0dHA6Ly93d3cudzMub3JnL1RSLzIwMTIvV0QtaHRtbDUtYXV0aG9yLTIwMTIwMzI5L3RoZS1jYW52YXMtZWxlbWVudC5odG1sI3RoZS1jYW52YXMtZWxlbWVudFxuXHRcdHRoaXMud2lkdGggPSB0aGlzLnZpZXcud2lkdGggPSB3aWR0aCB8fCAzMDA7XG5cdFx0dGhpcy5oZWlnaHQgPSB0aGlzLnZpZXcuaGVpZ2h0ID0gaGVpZ2h0IHx8IDE1MDtcblxuXHRcdC8vc2V0dXAgY29udGV4dCBsb3N0IGFuZCByZXN0b3JlIGxpc3RlbmVyc1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0bG9zdFwiLCBmdW5jdGlvbiAoZXYpIHtcblx0XHRcdHRoaXMuX2NvbnRleHRMb3N0KGV2KTtcblx0XHR9LmJpbmQodGhpcykpO1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0cmVzdG9yZWRcIiwgZnVuY3Rpb24gKGV2KSB7XG5cdFx0XHR0aGlzLl9jb250ZXh0UmVzdG9yZWQoZXYpO1xuXHRcdH0uYmluZCh0aGlzKSk7XG5cdFx0XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuZ2wgPSB0aGlzLnZpZXcuZ2V0Q29udGV4dChcIndlYmdsXCIsIGNvbnRleHRBdHRyaWJ1dGVzKSBcblx0XHRcdFx0XHRcdHx8IHRoaXMudmlldy5nZXRDb250ZXh0KFwiZXhwZXJpbWVudGFsLXdlYmdsXCIsIGNvbnRleHRBdHRyaWJ1dGVzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvdyBcIldlYkdMIENvbnRleHQgTm90IFN1cHBvcnRlZCAtLSB0cnkgZW5hYmxpbmcgaXQgb3IgdXNpbmcgYSBkaWZmZXJlbnQgYnJvd3NlclxcblwiXG5cdFx0XHRcdCsgZTsgLy9wcmludCBlcnIgbXNnXG5cdFx0fVxuXHR9LFxuXG5cdGluaXRHTDogZnVuY3Rpb24oKSB7XG5cblx0fSxcblxuXHRfY29udGV4dExvc3Q6IGZ1bmN0aW9uKGV2KSB7XG5cblx0fSxcblxuXHRfY29udGV4dFJlc3RvcmVkOiBmdW5jdGlvbihldikge1xuXG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdlYkdMQ2FudmFzOyIsInZhciBDbGFzcyA9IHJlcXVpcmUoJy4vbGliL0NsYXNzJyksXG5cdEVudW0gPSByZXF1aXJlKCcuL2xpYi9FbnVtJyksXG5cdEludGVyZmFjZSA9IHJlcXVpcmUoJy4vbGliL0ludGVyZmFjZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0Q2xhc3M6IENsYXNzLFxuXHRFbnVtOiBFbnVtLFxuXHRJbnRlcmZhY2U6IEludGVyZmFjZVxufTsiLCJ2YXIgQmFzZUNsYXNzID0gcmVxdWlyZSgnLi9iYXNlQ2xhc3MnKTtcblxudmFyIENsYXNzID0gZnVuY3Rpb24oIGRlc2NyaXB0b3IgKSB7XG5cdGlmICghZGVzY3JpcHRvcikgXG5cdFx0ZGVzY3JpcHRvciA9IHt9O1xuXHRcblx0aWYoIGRlc2NyaXB0b3IuaW5pdGlhbGl6ZSApIHtcblx0XHR2YXIgclZhbCA9IGRlc2NyaXB0b3IuaW5pdGlhbGl6ZTtcblx0XHRkZWxldGUgZGVzY3JpcHRvci5pbml0aWFsaXplO1xuXHR9IGVsc2Uge1xuXHRcdHJWYWwgPSBmdW5jdGlvbigpIHsgdGhpcy5wYXJlbnQuYXBwbHkoIHRoaXMsIGFyZ3VtZW50cyApOyB9O1xuXHR9XG5cblx0aWYoIGRlc2NyaXB0b3IuRXh0ZW5kcyApIHtcblx0XHRyVmFsLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoIGRlc2NyaXB0b3IuRXh0ZW5kcy5wcm90b3R5cGUgKTtcblx0XHQvLyB0aGlzIHdpbGwgYmUgdXNlZCB0byBjYWxsIHRoZSBwYXJlbnQgY29uc3RydWN0b3Jcblx0XHRyVmFsLiQkcGFyZW50Q29uc3RydWN0b3IgPSBkZXNjcmlwdG9yLkV4dGVuZHM7XG5cdFx0ZGVsZXRlIGRlc2NyaXB0b3IuRXh0ZW5kcztcblx0fSBlbHNlIHtcblx0XHRyVmFsLiQkcGFyZW50Q29uc3RydWN0b3IgPSBmdW5jdGlvbigpIHt9XG5cdFx0clZhbC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKCBCYXNlQ2xhc3MgKTtcblx0fVxuXG5cdHJWYWwucHJvdG90eXBlLiQkZ2V0dGVycyA9IHt9O1xuXHRyVmFsLnByb3RvdHlwZS4kJHNldHRlcnMgPSB7fTtcblxuXHRmb3IoIHZhciBpIGluIGRlc2NyaXB0b3IgKSB7XG5cdFx0aWYoIHR5cGVvZiBkZXNjcmlwdG9yWyBpIF0gPT0gJ2Z1bmN0aW9uJyApIHtcblx0XHRcdGRlc2NyaXB0b3JbIGkgXS4kJG5hbWUgPSBpO1xuXHRcdFx0ZGVzY3JpcHRvclsgaSBdLiQkb3duZXIgPSByVmFsLnByb3RvdHlwZTtcblxuXHRcdFx0clZhbC5wcm90b3R5cGVbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXTtcblx0XHR9IGVsc2UgaWYoIGRlc2NyaXB0b3JbIGkgXSAmJiB0eXBlb2YgZGVzY3JpcHRvclsgaSBdID09ICdvYmplY3QnICYmICggZGVzY3JpcHRvclsgaSBdLmdldCB8fCBkZXNjcmlwdG9yWyBpIF0uc2V0ICkgKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoIHJWYWwucHJvdG90eXBlLCBpICwgZGVzY3JpcHRvclsgaSBdICk7XG5cblx0XHRcdGlmKCBkZXNjcmlwdG9yWyBpIF0uZ2V0ICkge1xuXHRcdFx0XHRyVmFsLnByb3RvdHlwZS4kJGdldHRlcnNbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXS5nZXQ7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5nZXQuJCRuYW1lID0gaTtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLmdldC4kJG93bmVyID0gclZhbC5wcm90b3R5cGU7XG5cdFx0XHR9XG5cblx0XHRcdGlmKCBkZXNjcmlwdG9yWyBpIF0uc2V0ICkge1xuXHRcdFx0XHRyVmFsLnByb3RvdHlwZS4kJHNldHRlcnNbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXS5zZXQ7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5zZXQuJCRuYW1lID0gaTtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLnNldC4kJG93bmVyID0gclZhbC5wcm90b3R5cGU7XHRcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0clZhbC5wcm90b3R5cGVbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXTtcblx0XHR9XG5cdH1cblxuXHQvLyB0aGlzIHdpbGwgYmUgdXNlZCB0byBjaGVjayBpZiB0aGUgY2FsbGVyIGZ1bmN0aW9uIGlzIHRoZSBjb25zcnVjdG9yXG5cdHJWYWwuJCRpc0NvbnN0cnVjdG9yID0gdHJ1ZTtcblxuXG5cdC8vIG5vdyB3ZSdsbCBjaGVjayBpbnRlcmZhY2VzXG5cdGZvciggdmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrICkge1xuXHRcdGFyZ3VtZW50c1sgaSBdLmNvbXBhcmUoIHJWYWwgKTtcblx0fVxuXG5cdHJldHVybiByVmFsO1xufTtcdFxuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCcuL0NsYXNzJyk7XG5cbi8qKlxuVGhlIEVudW0gY2xhc3MsIHdoaWNoIGhvbGRzIGEgc2V0IG9mIGNvbnN0YW50cyBpbiBhIGZpeGVkIG9yZGVyLlxuXG4jIyMjIEJhc2ljIFVzYWdlOlxuXHR2YXIgRGF5cyA9IG5ldyBFbnVtKFsgXG5cdFx0XHQnTW9uZGF5Jyxcblx0XHRcdCdUdWVzZGF5Jyxcblx0XHRcdCdXZWRuZXNkYXknLFxuXHRcdFx0J1RodXJzZGF5Jyxcblx0XHRcdCdGcmlkYXknLFxuXHRcdFx0J1NhdHVyZGF5Jyxcblx0XHRcdCdTdW5kYXknXG5cdF0pO1xuXG5cdGNvbnNvbGUubG9nKCBEYXlzLk1vbmRheSA9PT0gRGF5cy5UdWVzZGF5ICk7IC8vID0+IGZhbHNlXG5cdGNvbnNvbGUubG9nKCBEYXlzLnZhbHVlc1sxXSApIC8vID0+IHRoZSAnVHVlc2RheScgc3ltYm9sIG9iamVjdFxuXG5FYWNoIGVudW0gKnN5bWJvbCogaXMgYW4gb2JqZWN0IHdoaWNoIGV4dGVuZHMgZnJvbSB0aGUgYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWAgXG5jbGFzcy4gVGhpcyBiYXNlXG5jbGFzcyBoYXMgIHByb3BlcnRpZXMgbGlrZSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlL3ZhbHVlOnByb3BlcnR5XCJ9fXt7L2Nyb3NzTGlua319YCAgXG5hbmQgYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZS9vcmRpbmFsOnByb3BlcnR5XCJ9fXt7L2Nyb3NzTGlua319YC4gXG5fX2B2YWx1ZWBfXyBpcyBhIHN0cmluZ1xud2hpY2ggbWF0Y2hlcyB0aGUgZWxlbWVudCBvZiB0aGUgYXJyYXkuIF9fYG9yZGluYWxgX18gaXMgdGhlIGluZGV4IHRoZSBcbnN5bWJvbCB3YXMgZGVmaW5lZCBhdCBpbiB0aGUgZW51bWVyYXRpb24uIFxuXG5UaGUgcmVzdWx0aW5nIEVudW0gb2JqZWN0IChpbiB0aGUgYWJvdmUgY2FzZSwgRGF5cykgYWxzbyBoYXMgc29tZSB1dGlsaXR5IG1ldGhvZHMsXG5saWtlIGZyb21WYWx1ZShzdHJpbmcpIGFuZCB0aGUgdmFsdWVzIHByb3BlcnR5IHRvIGFjY2VzcyB0aGUgYXJyYXkgb2Ygc3ltYm9scy5cblxuTm90ZSB0aGF0IHRoZSB2YWx1ZXMgYXJyYXkgaXMgZnJvemVuLCBhcyBpcyBlYWNoIHN5bWJvbC4gVGhlIHJldHVybmVkIG9iamVjdCBpcyBcbl9fbm90X18gZnJvemVuLCBhcyB0byBhbGxvdyB0aGUgdXNlciB0byBtb2RpZnkgaXQgKGkuZS4gYWRkIFwic3RhdGljXCIgbWVtYmVycykuXG5cbkEgbW9yZSBhZHZhbmNlZCBFbnVtIHVzYWdlIGlzIHRvIHNwZWNpZnkgYSBiYXNlIEVudW0gc3ltYm9sIGNsYXNzIGFzIHRoZSBzZWNvbmRcbnBhcmFtZXRlci4gVGhpcyBpcyB0aGUgY2xhc3MgdGhhdCBlYWNoIHN5bWJvbCB3aWxsIHVzZS4gVGhlbiwgaWYgYW55IHN5bWJvbHNcbmFyZSBnaXZlbiBhcyBhbiBBcnJheSAoaW5zdGVhZCBvZiBzdHJpbmcpLCBpdCB3aWxsIGJlIHRyZWF0ZWQgYXMgYW4gYXJyYXkgb2YgYXJndW1lbnRzXG50byB0aGUgYmFzZSBjbGFzcy4gVGhlIGZpcnN0IGFyZ3VtZW50IHNob3VsZCBhbHdheXMgYmUgdGhlIGRlc2lyZWQga2V5IG9mIHRoYXQgc3ltYm9sLlxuXG5Ob3RlIHRoYXQgX19gb3JkaW5hbGBfXyBpcyBhZGRlZCBkeW5hbWljYWxseVxuYWZ0ZXIgdGhlIHN5bWJvbCBpcyBjcmVhdGVkOyBzbyBpdCBjYW4ndCBiZSB1c2VkIGluIHRoZSBzeW1ib2wncyBjb25zdHJ1Y3Rvci5cblxuIyMjIyBBZHZhbmNlZCBVc2FnZVxuXHR2YXIgRGF5cyA9IG5ldyBFbnVtKFsgXG5cdFx0XHQnTW9uZGF5Jyxcblx0XHRcdCdUdWVzZGF5Jyxcblx0XHRcdCdXZWRuZXNkYXknLFxuXHRcdFx0J1RodXJzZGF5Jyxcblx0XHRcdCdGcmlkYXknLFxuXHRcdFx0WydTYXR1cmRheScsIHRydWVdLFxuXHRcdFx0WydTdW5kYXknLCB0cnVlXVxuXHRcdF0sIG5ldyBDbGFzcyh7XG5cdFx0XHRcblx0XHRcdEV4dGVuZHM6IEVudW0uQmFzZSxcblxuXHRcdFx0aXNXZWVrZW5kOiBmYWxzZSxcblxuXHRcdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oIGtleSwgaXNXZWVrZW5kICkge1xuXHRcdFx0XHQvL3Bhc3MgdGhlIHN0cmluZyB2YWx1ZSBhbG9uZyB0byBwYXJlbnQgY29uc3RydWN0b3Jcblx0XHRcdFx0dGhpcy5wYXJlbnQoIGtleSApOyBcblx0XHRcdFx0XG5cdFx0XHRcdC8vZ2V0IGEgYm9vbGVhbiBwcmltaXRpdmUgb3V0IG9mIHRoZSB0cnV0aHkvZmFsc3kgdmFsdWVcblx0XHRcdFx0dGhpcy5pc1dla2VlbmQgPSBCb29sZWFuKGlzV2Vla2VuZCk7XG5cdFx0XHR9XG5cdFx0fSlcblx0KTtcblxuXHRjb25zb2xlLmxvZyggRGF5cy5TYXR1cmRheS5pc1dlZWtlbmQgKTsgLy8gPT4gdHJ1ZVxuXG5UaGlzIG1ldGhvZCB3aWxsIHRocm93IGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gc3BlY2lmeSBhIGNsYXNzIHdoaWNoIGRvZXNcbm5vdCBleHRlbmQgZnJvbSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YC5cblxuIyMjIyBTaG9ydGhhbmRcblxuWW91IGNhbiBhbHNvIG9taXQgdGhlIGBuZXcgQ2xhc3NgIGFuZCBwYXNzIGEgZGVzY3JpcHRvciwgdGh1cyByZWR1Y2luZyB0aGUgbmVlZCB0byBcbmV4cGxpY2l0bHkgcmVxdWlyZSB0aGUgQ2xhc3MgbW9kdWxlLiBGdXJ0aGVyLCBpZiB5b3UgYXJlIHBhc3NpbmcgYSBkZXNjcmlwdG9yIHRoYXRcbmRvZXMgbm90IGhhdmUgYEV4dGVuZHNgIGRlZmluZWQsIGl0IHdpbGwgZGVmYXVsdCB0b1xuYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWAuXG5cblx0dmFyIEljb25zID0gbmV3IEVudW0oWyBcblx0XHRcdCdPcGVuJyxcblx0XHRcdCdTYXZlJyxcblx0XHRcdCdIZWxwJyxcblx0XHRcdCdOZXcnXG5cdFx0XSwge1xuXG5cdFx0XHRwYXRoOiBmdW5jdGlvbiggcmV0aW5hICkge1xuXHRcdFx0XHRyZXR1cm4gXCJpY29ucy9cIiArIHRoaXMudmFsdWUudG9Mb3dlckNhc2UoKSArIChyZXRpbmEgPyBcIkAyeFwiIDogXCJcIikgKyBcIi5wbmdcIjtcblx0XHRcdH1cblx0XHR9XG5cdCk7XG5cblxuQGNsYXNzIEVudW1cbkBjb25zdHJ1Y3RvciBcbkBwYXJhbSB7QXJyYXl9IGVsZW1lbnRzIEFuIGFycmF5IG9mIGVudW1lcmF0ZWQgY29uc3RhbnRzLCBvciBhcmd1bWVudHMgdG8gYmUgcGFzc2VkIHRvIHRoZSBzeW1ib2xcbkBwYXJhbSB7Q2xhc3N9IGJhc2UgQ2xhc3MgdG8gYmUgaW5zdGFudGlhdGVkIGZvciBlYWNoIGVudW0gc3ltYm9sLCBtdXN0IGV4dGVuZCBcbmB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2VcIn19e3svY3Jvc3NMaW5rfX1gXG4qL1xudmFyIEVudW1SZXN1bHQgPSBuZXcgQ2xhc3Moe1xuXG5cdC8qKlxuXHRBbiBhcnJheSBvZiB0aGUgZW51bWVyYXRlZCBzeW1ib2wgb2JqZWN0cy5cblxuXHRAcHJvcGVydHkgdmFsdWVzXG5cdEB0eXBlIEFycmF5XG5cdCovXG5cdHZhbHVlczogbnVsbCxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy52YWx1ZXMgPSBbXTtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBcIlsgXCIrdGhpcy52YWx1ZXMuam9pbihcIiwgXCIpK1wiIF1cIjtcblx0fSxcblxuXHQvKipcblx0TG9va3MgZm9yIHRoZSBmaXJzdCBzeW1ib2wgaW4gdGhpcyBlbnVtIHdob3NlICd2YWx1ZScgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIHN0cmluZy4gXG5cdElmIG5vbmUgYXJlIGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cblx0QG1ldGhvZCBmcm9tVmFsdWVcblx0QHBhcmFtIHtTdHJpbmd9IHN0ciB0aGUgc3RyaW5nIHRvIGxvb2sgdXBcblx0QHJldHVybiB7RW51bS5CYXNlfSByZXR1cm5zIGFuIGVudW0gc3ltYm9sIGZyb20gdGhlIGdpdmVuICd2YWx1ZScgc3RyaW5nLCBvciBudWxsXG5cdCovXG5cdGZyb21WYWx1ZTogZnVuY3Rpb24gKHN0cikge1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLnZhbHVlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHN0ciA9PT0gdGhpcy52YWx1ZXNbaV0udmFsdWUpXG5cdFx0XHRcdHJldHVybiB0aGlzLnZhbHVlc1tpXTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn0pO1xuXG5cblxudmFyIEVudW0gPSBmdW5jdGlvbiAoIGVsZW1lbnRzLCBiYXNlICkge1xuXHRpZiAoIWJhc2UpXG5cdFx0YmFzZSA9IEVudW0uQmFzZTtcblxuXHQvL1RoZSB1c2VyIGlzIG9taXR0aW5nIENsYXNzLCBpbmplY3QgaXQgaGVyZVxuXHRpZiAodHlwZW9mIGJhc2UgPT09IFwib2JqZWN0XCIpIHtcblx0XHQvL2lmIHdlIGRpZG4ndCBzcGVjaWZ5IGEgc3ViY2xhc3MuLiBcblx0XHRpZiAoIWJhc2UuRXh0ZW5kcylcblx0XHRcdGJhc2UuRXh0ZW5kcyA9IEVudW0uQmFzZTtcblx0XHRiYXNlID0gbmV3IENsYXNzKGJhc2UpO1xuXHR9XG5cdFxuXHR2YXIgcmV0ID0gbmV3IEVudW1SZXN1bHQoKTtcblxuXHRmb3IgKHZhciBpPTA7IGk8ZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHR2YXIgZSA9IGVsZW1lbnRzW2ldO1xuXG5cdFx0dmFyIG9iaiA9IG51bGw7XG5cdFx0dmFyIGtleSA9IG51bGw7XG5cblx0XHRpZiAoIWUpXG5cdFx0XHR0aHJvdyBcImVudW0gdmFsdWUgYXQgaW5kZXggXCIraStcIiBpcyB1bmRlZmluZWRcIjtcblxuXHRcdGlmICh0eXBlb2YgZSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0a2V5ID0gZTtcblx0XHRcdG9iaiA9IG5ldyBiYXNlKGUpO1xuXHRcdFx0cmV0W2VdID0gb2JqO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZSkpXG5cdFx0XHRcdHRocm93IFwiZW51bSB2YWx1ZXMgbXVzdCBiZSBTdHJpbmcgb3IgYW4gYXJyYXkgb2YgYXJndW1lbnRzXCI7XG5cblx0XHRcdGtleSA9IGVbMF07XG5cblx0XHRcdC8vZmlyc3QgYXJnIGlzIGlnbm9yZWRcblx0XHRcdGUudW5zaGlmdChudWxsKTtcblx0XHRcdG9iaiA9IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoYmFzZSwgZSkpO1xuXG5cdFx0XHRyZXRba2V5XSA9IG9iajtcblx0XHR9XG5cblx0XHRpZiAoICEob2JqIGluc3RhbmNlb2YgRW51bS5CYXNlKSApXG5cdFx0XHR0aHJvdyBcImVudW0gYmFzZSBjbGFzcyBtdXN0IGJlIGEgc3ViY2xhc3Mgb2YgRW51bS5CYXNlXCI7XG5cblx0XHRvYmoub3JkaW5hbCA9IGk7XG5cdFx0cmV0LnZhbHVlcy5wdXNoKG9iaik7XG5cdFx0T2JqZWN0LmZyZWV6ZShvYmopO1xuXHR9O1xuXG5cdC8vd2UgU0hPVUxEIGZyZWV6ZSB0aGUgcmV0dXJybmVkIG9iamVjdCwgYnV0IG1vc3QgSlMgZGV2ZWxvcGVyc1xuXHQvL2FyZW4ndCBleHBlY3RpbmcgYW4gb2JqZWN0IHRvIGJlIGZyb3plbiwgYW5kIHRoZSBicm93c2VycyBkb24ndCBhbHdheXMgd2FybiB1cy5cblx0Ly9JdCBqdXN0IGNhdXNlcyBmcnVzdHJhdGlvbiwgZS5nLiBpZiB5b3UncmUgdHJ5aW5nIHRvIGFkZCBhIHN0YXRpYyBvciBjb25zdGFudFxuXHQvL3RvIHRoZSByZXR1cm5lZCBvYmplY3QuXG5cblx0Ly8gT2JqZWN0LmZyZWV6ZShyZXQpO1xuXHRPYmplY3QuZnJlZXplKHJldC52YWx1ZXMpO1xuXHRyZXR1cm4gcmV0O1xufTtcblxuXG4vKipcblxuVGhlIGJhc2UgdHlwZSBmb3IgRW51bSBzeW1ib2xzLiBTdWJjbGFzc2VzIGNhbiBleHRlbmRcbnRoaXMgdG8gaW1wbGVtZW50IG1vcmUgZnVuY3Rpb25hbGl0eSBmb3IgZW51bSBzeW1ib2xzLlxuXG5AY2xhc3MgRW51bS5CYXNlXG5AY29uc3RydWN0b3IgXG5AcGFyYW0ge1N0cmluZ30ga2V5IHRoZSBzdHJpbmcgdmFsdWUgZm9yIHRoaXMgc3ltYm9sXG4qL1xuRW51bS5CYXNlID0gbmV3IENsYXNzKHtcblxuXHQvKipcblx0VGhlIHN0cmluZyB2YWx1ZSBvZiB0aGlzIHN5bWJvbC5cblx0QHByb3BlcnR5IHZhbHVlXG5cdEB0eXBlIFN0cmluZ1xuXHQqL1xuXHR2YWx1ZTogdW5kZWZpbmVkLFxuXG5cdC8qKlxuXHRUaGUgaW5kZXggb2YgdGhpcyBzeW1ib2wgaW4gaXRzIGVudW1lcmF0aW9uIGFycmF5LlxuXHRAcHJvcGVydHkgb3JkaW5hbFxuXHRAdHlwZSBOdW1iZXJcblx0Ki9cblx0b3JkaW5hbDogdW5kZWZpbmVkLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICgga2V5ICkge1xuXHRcdHRoaXMudmFsdWUgPSBrZXk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlIHx8IHRoaXMucGFyZW50KCk7XG5cdH0sXG5cblx0dmFsdWVPZjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgfHwgdGhpcy5wYXJlbnQoKTtcblx0fVxufSk7XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEVudW07XG4iLCJcbnZhciBJbnRlcmZhY2UgPSBmdW5jdGlvbiggZGVzY3JpcHRvciApIHtcblx0dGhpcy5kZXNjcmlwdG9yID0gZGVzY3JpcHRvcjtcbn07XG5cbkludGVyZmFjZS5wcm90b3R5cGUuZGVzY3JpcHRvciA9IG51bGw7XG5cbkludGVyZmFjZS5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uKCBjbGFzc1RvQ2hlY2sgKSB7XG5cblx0Zm9yKCB2YXIgaSAgaW4gdGhpcy5kZXNjcmlwdG9yICkge1xuXHRcdC8vIEZpcnN0IHdlJ2xsIGNoZWNrIGlmIHRoaXMgcHJvcGVydHkgZXhpc3RzIG9uIHRoZSBjbGFzc1xuXHRcdGlmKCBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0gPT09IHVuZGVmaW5lZCApIHtcblxuXHRcdFx0dGhyb3cgJ0lOVEVSRkFDRSBFUlJPUjogJyArIGkgKyAnIGlzIG5vdCBkZWZpbmVkIGluIHRoZSBjbGFzcyc7XG5cblx0XHQvLyBTZWNvbmQgd2UnbGwgY2hlY2sgdGhhdCB0aGUgdHlwZXMgZXhwZWN0ZWQgbWF0Y2hcblx0XHR9IGVsc2UgaWYoIHR5cGVvZiB0aGlzLmRlc2NyaXB0b3JbIGkgXSAhPSB0eXBlb2YgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiBJbnRlcmZhY2UgYW5kIGNsYXNzIGRlZmluZSBpdGVtcyBvZiBkaWZmZXJlbnQgdHlwZSBmb3IgJyArIGkgKyBcblx0XHRcdFx0ICAnXFxuaW50ZXJmYWNlWyAnICsgaSArICcgXSA9PSAnICsgdHlwZW9mIHRoaXMuZGVzY3JpcHRvclsgaSBdICtcblx0XHRcdFx0ICAnXFxuY2xhc3NbICcgKyBpICsgJyBdID09ICcgKyB0eXBlb2YgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdO1xuXG5cdFx0Ly8gVGhpcmQgaWYgdGhpcyBwcm9wZXJ0eSBpcyBhIGZ1bmN0aW9uIHdlJ2xsIGNoZWNrIHRoYXQgdGhleSBleHBlY3QgdGhlIHNhbWUgYW1vdW50IG9mIHBhcmFtZXRlcnNcblx0XHR9IGVsc2UgaWYoIHR5cGVvZiB0aGlzLmRlc2NyaXB0b3JbIGkgXSA9PSAnZnVuY3Rpb24nICYmIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXS5sZW5ndGggIT0gdGhpcy5kZXNjcmlwdG9yWyBpIF0ubGVuZ3RoICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiBJbnRlcmZhY2UgYW5kIGNsYXNzIGV4cGVjdCBhIGRpZmZlcmVudCBhbW91bnQgb2YgcGFyYW1ldGVycyBmb3IgdGhlIGZ1bmN0aW9uICcgKyBpICtcblx0XHRcdFx0ICAnXFxuRVhQRUNURUQ6ICcgKyB0aGlzLmRlc2NyaXB0b3JbIGkgXS5sZW5ndGggKyBcblx0XHRcdFx0ICAnXFxuUkVDRUlWRUQ6ICcgKyBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0ubGVuZ3RoO1xuXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBJbnRlcmZhY2U7IiwiLy9FeHBvcnRzIGEgZnVuY3Rpb24gbmFtZWQgJ3BhcmVudCdcbm1vZHVsZS5leHBvcnRzLnBhcmVudCA9IGZ1bmN0aW9uKCkge1xuXHQvLyBpZiB0aGUgY3VycmVudCBmdW5jdGlvbiBjYWxsaW5nIGlzIHRoZSBjb25zdHJ1Y3RvclxuXHRpZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkaXNDb25zdHJ1Y3RvciApIHtcblx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRwYXJlbnRDb25zdHJ1Y3Rvcjtcblx0fSBlbHNlIHtcblx0XHRpZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkbmFtZSApIHtcblx0XHRcdHZhciBjYWxsZXJOYW1lID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkbmFtZTtcblx0XHRcdHZhciBpc0dldHRlciA9IHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyLiQkZ2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXHRcdFx0dmFyIGlzU2V0dGVyID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIuJCRzZXR0ZXJzWyBjYWxsZXJOYW1lIF07XG5cblx0XHRcdGlmKCBhcmd1bWVudHMubGVuZ3RoID09IDEgJiYgaXNTZXR0ZXIgKSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKS4kJHNldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0XHRpZiggcGFyZW50RnVuY3Rpb24gPT09IHVuZGVmaW5lZCApIHtcblx0XHRcdFx0XHR0aHJvdyAnTm8gc2V0dGVyIGRlZmluZWQgaW4gcGFyZW50Jztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmKCBhcmd1bWVudHMubGVuZ3RoID09IDAgJiYgaXNHZXR0ZXIgKSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKS4kJGdldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0XHRpZiggcGFyZW50RnVuY3Rpb24gPT09IHVuZGVmaW5lZCApIHtcblx0XHRcdFx0XHR0aHJvdyAnTm8gZ2V0dGVyIGRlZmluZWQgaW4gcGFyZW50Jztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmKCBpc1NldHRlciB8fCBpc0dldHRlciApIHtcblx0XHRcdFx0dGhyb3cgJ0luY29ycmVjdCBhbW91bnQgb2YgYXJndW1lbnRzIHNlbnQgdG8gZ2V0dGVyIG9yIHNldHRlcic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoIHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyIClbIGNhbGxlck5hbWUgXTtcdFxuXG5cdFx0XHRcdGlmKCBwYXJlbnRGdW5jdGlvbiA9PT0gdW5kZWZpbmVkICkge1xuXHRcdFx0XHRcdHRocm93ICdObyBwYXJlbnQgZnVuY3Rpb24gZGVmaW5lZCBmb3IgJyArIGNhbGxlck5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgJ1lvdSBjYW5ub3QgY2FsbCBwYXJlbnQgaGVyZSc7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHBhcmVudEZ1bmN0aW9uLmFwcGx5KCB0aGlzLCBhcmd1bWVudHMgKTtcbn07Il19
;