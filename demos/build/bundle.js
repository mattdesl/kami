;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var WebGLCanvas = require('kami').WebGLCanvas;
var ShaderProgram = require('kami').ShaderProgram;
var Texture = require('kami').Texture;

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

	//create our webGL context..
	var context = new WebGLCanvas(800, 600, canvas[0], {
		antialias: true	
	});
	
	//create a basic shader..
	var shader = new ShaderProgram(context.gl, $("#vert_shader").html(), $("#frag_shader").html());

	//create a texture from Image
	var tex = new Texture(context.gl);





	//async load an image
	var image = new Image();
	image.src = "img/bunny.png";
	image.onload = function() {
		console.log("image loaded");
		tex.uploadImage(image);
		console.log(tex.width, tex.height);
	}.bind(this);

	requestAnimationFrame(render);

	function render() {
		
		requestAnimationFrame(render);
	}
}); 
},{"kami":5}],2:[function(require,module,exports){
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
		if (!vertSource || !fragSource)
			throw "vertex and fragment shaders must be defined";

		this.attribLocations = attribLocations;

		//We trim (ECMAScript5) so that the GLSL line numbers are
		//accurate on shader log
		this.vertSource = vertSource.trim();
		this.fragSource = fragSource.trim();

		this.create(gl);
	},

	/** 
	 * This is called during the ShaderProgram constructor,
	 * and may need to be called again after context loss and restore.
	 * @param {WebGLContext} gl the new GL context
	 */
	create: function(gl) {
		if (!gl)
			throw "no GL context specified";
		this.gl = gl;
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

	bind: function() {
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
},{"jsOOP":6}],3:[function(require,module,exports){
var Class = require('jsOOP').Class;

var Texture = new Class({

	id: null,
	target: null,
	width: 0,
	height: 0,

	initialize: function(gl, target) {
		if (!gl)
			throw "no GL context specified";
		this.gl = gl;
		this.target = target || gl.TEXTURE_2D;
		this.id = gl.createTexture();
		this.width = this.height = 0;
	},

	/**
	 * A low-level method to upload the specified ArrayBufferView
	 * to this texture. This will cause the width and height of this
	 * texture to change.
	 * 
	 * [uploadData description]
	 * @param  {ArrayBufferView} data  the raw data for this texture
	 * @param  {Number} width          the new width of this texture,
	 *                                 defaults to the last used width (or zero)
	 * @param  {Number} height         the new height of this texture
	 *                                 defaults to the last used height (or zero)
	 * @param  {GLenum} format         the data format, default RGBA
	 * @param  {GLenum} type           the data type, default UNSIGNED_BYTE (Uint8Array)
	 */
	uploadData: function(data, width, height, format, type) {
		var gl = this.gl;

		this.format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		
		this.width = (width || width==0) ? width : this.width;
		this.height = (height || height==0) ? height : this.height;

		this.bind();

		gl.texImage2D(this.target, 0, this.format, 
					  this.width, this.height, 0, this.format,
					  type, data);
	},

	/**
	 * Uploads ImageData, HTMLImageElement, HTMLCanvasElement or 
	 * HTMLVideoElement.
	 * 	
	 * @param  {Object} domObject the DOM image container
	 */
	uploadImage: function(domObject, format, type) {
		var gl = this.gl;

		this.format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		
		this.width = domObject.width;
		this.height = domObject.height;

		this.bind();

		gl.texImage2D(this.target, 0, this.format, this.format,
					  type, domObject);
	},

	/**
	 * Binds the texture. If unit is specified,
	 * it will bind the texture at the given slot
	 * (TEXTURE0, TEXTURE1, etc). If unit is not specified,
	 * it will simply bind the texture at whichever slot
	 * is currently active.
	 * 
	 * @param  {Number} unit the texture unit index, starting at 0
	 */
	bind: function(unit) {
		var gl = this.gl;
		if (unit || unit === 0)
			gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(this.target, this.id);
	}
});

Texture.Filter = {
	NEAREST: 9728,
	NEAREST_MIPMAP_LINEAR: 9986,
	NEAREST_MIPMAP_NEAREST: 9984,
	LINEAR: 9729,
	LINEAR_MIPMAP_LINEAR: 9987,
	LINEAR_MIPMAP_NEAREST: 9985
};
Texture.Wrap = {
	CLAMP_TO_EDGE: 33071,
	MIRRORED_REPEAT: 33648,
	REPEAT: 10497
};

//Unmanaged textures:
//	HTML elements like Image, Video, Canvas
//	pixels buffer from Canvas
//	pixels array

//Need special handling:
//  context.onContextLost.add(function() {
//  	createDynamicTexture();
//  }.bind(this));

//Managed textures:
//	images specified with a path
//	this will use Image under the hood



module.exports = Texture;
},{"jsOOP":6}],4:[function(require,module,exports){
var Class = require('jsOOP').Class;

var WebGLCanvas = new Class({
	//extend a base class!!	
	
	textureCache: null,
	shaderCache: null,
	
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
		//all textures/shaders/buffers/FBOs have been deleted... 
		//we need to re-create them on restore
	},

	_contextRestored: function(ev) {
		
	}
});

module.exports = WebGLCanvas;
},{"jsOOP":6}],5:[function(require,module,exports){
module.exports = {
	ShaderProgram: require('./ShaderProgram'),
	WebGLCanvas: require('./WebGLCanvas'),
	Texture: require('./Texture')
};
},{"./ShaderProgram":2,"./Texture":3,"./WebGLCanvas":4}],6:[function(require,module,exports){
var Class = require('./lib/Class'),
	Enum = require('./lib/Enum'),
	Interface = require('./lib/Interface');

module.exports = {
	Class: Class,
	Enum: Enum,
	Interface: Interface
};
},{"./lib/Class":7,"./lib/Enum":8,"./lib/Interface":9}],7:[function(require,module,exports){
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
},{"./baseClass":10}],8:[function(require,module,exports){
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

},{"./Class":7}],9:[function(require,module,exports){

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
},{}],10:[function(require,module,exports){
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2RlbW9zL3NyYy9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1NoYWRlclByb2dyYW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL2xpYi9UZXh0dXJlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9saWIvV2ViR0xDYW52YXMuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL2xpYi9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2pzT09QL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvbGliL0NsYXNzLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvbGliL0VudW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvSW50ZXJmYWNlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvbGliL2Jhc2VDbGFzcy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciBXZWJHTENhbnZhcyA9IHJlcXVpcmUoJ2thbWknKS5XZWJHTENhbnZhcztcbnZhciBTaGFkZXJQcm9ncmFtID0gcmVxdWlyZSgna2FtaScpLlNoYWRlclByb2dyYW07XG52YXIgVGV4dHVyZSA9IHJlcXVpcmUoJ2thbWknKS5UZXh0dXJlO1xuXG4kKGZ1bmN0aW9uKCkge1xuXHR2YXIgbWFpbkNvbnRhaW5lciA9ICQoXCJib2R5XCIpLmNzcyh7XG5cdFx0YmFja2dyb3VuZDogXCIjMDAwXCJcblx0fSk7XG5cblx0dmFyIGRlbW9Db250YWluZXJzID0gW107XG5cdHZhciBjdXJyZW50RGVtbyA9IG51bGw7XG5cdHZhciBjdXJyZW50SW5kZXggPSAwO1xuXG5cblx0dmFyIHdpZHRoID0gODAwO1xuXHR2YXIgaGVpZ2h0ID0gNjAwO1xuXG5cdHZhciBjYW52YXMgPSAkKFwiPGNhbnZhcz5cIiwge1xuXHRcdHdpZHRoOiB3aWR0aCxcblx0XHRoZWlnaHQ6IGhlaWdodFxuXHR9KS5jc3Moe1xuXHRcdGJhY2tncm91bmQ6IFwiIzM0MzQzNFwiLCAgXG5cdFx0cG9zaXRpb246IFwiZml4ZWRcIixcblx0XHR0b3A6IDAsXG5cdFx0bGVmdDogMCxcblx0XHRvdmVyZmxvdzogXCJoaWRkZW5cIlxuXHR9KTtcblxuXHRjYW52YXMuYXBwZW5kVG8obWFpbkNvbnRhaW5lcik7XG5cblx0Ly9jcmVhdGUgb3VyIHdlYkdMIGNvbnRleHQuLlxuXHR2YXIgY29udGV4dCA9IG5ldyBXZWJHTENhbnZhcyg4MDAsIDYwMCwgY2FudmFzWzBdLCB7XG5cdFx0YW50aWFsaWFzOiB0cnVlXHRcblx0fSk7XG5cdFxuXHQvL2NyZWF0ZSBhIGJhc2ljIHNoYWRlci4uXG5cdHZhciBzaGFkZXIgPSBuZXcgU2hhZGVyUHJvZ3JhbShjb250ZXh0LmdsLCAkKFwiI3ZlcnRfc2hhZGVyXCIpLmh0bWwoKSwgJChcIiNmcmFnX3NoYWRlclwiKS5odG1sKCkpO1xuXG5cdC8vY3JlYXRlIGEgdGV4dHVyZSBmcm9tIEltYWdlXG5cdHZhciB0ZXggPSBuZXcgVGV4dHVyZShjb250ZXh0LmdsKTtcblxuXG5cblxuXG5cdC8vYXN5bmMgbG9hZCBhbiBpbWFnZVxuXHR2YXIgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcblx0aW1hZ2Uuc3JjID0gXCJpbWcvYnVubnkucG5nXCI7XG5cdGltYWdlLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuXHRcdGNvbnNvbGUubG9nKFwiaW1hZ2UgbG9hZGVkXCIpO1xuXHRcdHRleC51cGxvYWRJbWFnZShpbWFnZSk7XG5cdFx0Y29uc29sZS5sb2codGV4LndpZHRoLCB0ZXguaGVpZ2h0KTtcblx0fS5iaW5kKHRoaXMpO1xuXG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xuXG5cdGZ1bmN0aW9uIHJlbmRlcigpIHtcblx0XHRcblx0XHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUocmVuZGVyKTtcblx0fVxufSk7ICIsInZhciBDbGFzcyA9IHJlcXVpcmUoJ2pzT09QJykuQ2xhc3M7XG5cbnZhciBTaGFkZXJQcm9ncmFtID0gbmV3IENsYXNzKHtcblx0XG5cdHZlcnRTb3VyY2U6IG51bGwsXG5cdGZyYWdTb3VyY2U6IG51bGwsIFxuIFxuXHR2ZXJ0U2hhZGVyOiBudWxsLFxuXHRmcmFnU2hhZGVyOiBudWxsLFxuXG5cdHByb2dyYW06IG51bGwsXG5cblx0dW5pZm9ybUNhY2hlOiBudWxsLFxuXHRhdHRyaWJ1dGVDYWNoZTogbnVsbCxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbihnbCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0aWYgKCF2ZXJ0U291cmNlIHx8ICFmcmFnU291cmNlKVxuXHRcdFx0dGhyb3cgXCJ2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlcnMgbXVzdCBiZSBkZWZpbmVkXCI7XG5cblx0XHR0aGlzLmF0dHJpYkxvY2F0aW9ucyA9IGF0dHJpYkxvY2F0aW9ucztcblxuXHRcdC8vV2UgdHJpbSAoRUNNQVNjcmlwdDUpIHNvIHRoYXQgdGhlIEdMU0wgbGluZSBudW1iZXJzIGFyZVxuXHRcdC8vYWNjdXJhdGUgb24gc2hhZGVyIGxvZ1xuXHRcdHRoaXMudmVydFNvdXJjZSA9IHZlcnRTb3VyY2UudHJpbSgpO1xuXHRcdHRoaXMuZnJhZ1NvdXJjZSA9IGZyYWdTb3VyY2UudHJpbSgpO1xuXG5cdFx0dGhpcy5jcmVhdGUoZ2wpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogVGhpcyBpcyBjYWxsZWQgZHVyaW5nIHRoZSBTaGFkZXJQcm9ncmFtIGNvbnN0cnVjdG9yLFxuXHQgKiBhbmQgbWF5IG5lZWQgdG8gYmUgY2FsbGVkIGFnYWluIGFmdGVyIGNvbnRleHQgbG9zcyBhbmQgcmVzdG9yZS5cblx0ICogQHBhcmFtIHtXZWJHTENvbnRleHR9IGdsIHRoZSBuZXcgR0wgY29udGV4dFxuXHQgKi9cblx0Y3JlYXRlOiBmdW5jdGlvbihnbCkge1xuXHRcdGlmICghZ2wpXG5cdFx0XHR0aHJvdyBcIm5vIEdMIGNvbnRleHQgc3BlY2lmaWVkXCI7XG5cdFx0dGhpcy5nbCA9IGdsO1xuXHRcdHRoaXMuX2NvbXBpbGVTaGFkZXJzKCk7XG5cdH0sXG5cblx0Ly9Db21waWxlcyB0aGUgc2hhZGVycywgdGhyb3dpbmcgYW4gZXJyb3IgaWYgdGhlIHByb2dyYW0gd2FzIGludmFsaWQuXG5cdF9jb21waWxlU2hhZGVyczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cblx0XHRcblx0XHR0aGlzLnZlcnRTaGFkZXIgPSB0aGlzLl9sb2FkU2hhZGVyKGdsLlZFUlRFWF9TSEFERVIsIHRoaXMudmVydFNvdXJjZSk7XG5cdFx0dGhpcy5mcmFnU2hhZGVyID0gdGhpcy5fbG9hZFNoYWRlcihnbC5GUkFHTUVOVF9TSEFERVIsIHRoaXMuZnJhZ1NvdXJjZSk7XG5cblx0XHRpZiAoIXRoaXMudmVydFNoYWRlciB8fCAhdGhpcy5mcmFnU2hhZGVyKVxuXHRcdFx0dGhyb3cgXCJFcnJvciByZXR1cm5lZCB3aGVuIGNhbGxpbmcgY3JlYXRlU2hhZGVyXCI7XG5cblx0XHR0aGlzLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKCk7XG5cblx0XHRpZiAodGhpcy5hdHRyaWJMb2NhdGlvbnMpIHtcblx0XHRcdGZvciAodmFyIGtleSBpbiB0aGlzLmF0dHJpYkxvY2F0aW9ucykge1xuXHRcdFx0XHRpZiAodGhpcy5hdHRyaWJMb2NhdGlvbnMuaGFzT3duUHJvcGVydHkoa2V5KSlcblx0XHQgICAgXHRcdGdsLmJpbmRBdHRyaWJMb2NhdGlvbih0aGlzLnByb2dyYW0sIHRoaXMuYXR0cmliTG9jYXRpb25zW2tleV0sIGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Z2wuYXR0YWNoU2hhZGVyKHRoaXMucHJvZ3JhbSwgdGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5hdHRhY2hTaGFkZXIodGhpcy5wcm9ncmFtLCB0aGlzLmZyYWdTaGFkZXIpO1xuXHRcdGdsLmxpbmtQcm9ncmFtKHRoaXMucHJvZ3JhbSk7IFxuXG5cdFx0aWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuTElOS19TVEFUVVMpKSB7XG5cdFx0XHR0aHJvdyBcIkVycm9yIGxpbmtpbmcgdGhlIHNoYWRlciBwcm9ncmFtOlxcblwiXG5cdFx0XHRcdCsgZ2wuZ2V0UHJvZ3JhbUluZm9Mb2codGhpcy5wcm9ncmFtKTtcblx0XHR9XG5cblx0XHR0aGlzLl9mZXRjaFVuaWZvcm1zKCk7XG5cdFx0dGhpcy5fZmV0Y2hBdHRyaWJ1dGVzKCk7XG5cdFx0XG5cdFx0Ly8gZm9yICh2YXIgayBpbiB0aGlzLnVuaWZvcm1DYWNoZSlcblx0XHQvLyBcdGNvbnNvbGUubG9nKGssIHRoaXMudW5pZm9ybUNhY2hlW2tdKVxuXHRcdC8vIGZvciAodmFyIGsgaW4gdGhpcy5hdHRyaWJ1dGVDYWNoZSlcblx0XHQvLyBcdGNvbnNvbGUubG9nKGssIHRoaXMuYXR0cmlidXRlQ2FjaGVba10pXG5cdH0sXG5cblx0X2ZldGNoVW5pZm9ybXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLnVuaWZvcm1DYWNoZSA9IHt9O1xuXG5cdFx0dmFyIGxlbiA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5BQ1RJVkVfVU5JRk9STVMpO1xuXHRcdGlmICghbGVuKSAvL251bGwgb3IgemVyb1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7XG5cdFx0XHR2YXIgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0odGhpcy5wcm9ncmFtLCBpKTtcblx0XHRcdGlmIChpbmZvID09PSBudWxsKSBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR2YXIgbmFtZSA9IGluZm8ubmFtZTtcblx0XHRcdHZhciBsb2NhdGlvbiA9IGdsLmdldFVuaWZvcm1Mb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuXHRcdFx0XG5cdFx0XHR0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSA9IHtcblx0XHRcdFx0c2l6ZTogaW5mby5zaXplLFxuXHRcdFx0XHR0eXBlOiBpbmZvLnR5cGUsXG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvblxuXHRcdFx0fTtcblx0XHR9XG5cdH0sXG5cblx0X2ZldGNoQXR0cmlidXRlczogZnVuY3Rpb24oKSB7IFxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7IFxuXG5cdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZSA9IHt9O1xuXG5cdFx0dmFyIGxlbiA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5BQ1RJVkVfQVRUUklCVVRFUyk7XG5cdFx0aWYgKCFsZW4pIC8vbnVsbCBvciB6ZXJvXG5cdFx0XHRyZXR1cm47XHRcblxuXHRcdGZvciAodmFyIGk9MDsgaTxsZW47IGkrKykge1xuXHRcdFx0dmFyIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIodGhpcy5wcm9ncmFtLCBpKTtcblx0XHRcdGlmIChpbmZvID09PSBudWxsKSBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR2YXIgbmFtZSA9IGluZm8ubmFtZTtcblxuXHRcdFx0Ly90aGUgYXR0cmliIGxvY2F0aW9uIGlzIGEgc2ltcGxlIGluZGV4XG5cdFx0XHR2YXIgbG9jYXRpb24gPSBnbC5nZXRBdHRyaWJMb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuXHRcdFx0XG5cdFx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdID0ge1xuXHRcdFx0XHRzaXplOiBpbmZvLnNpemUsXG5cdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblxuXHRfbG9hZFNoYWRlcjogZnVuY3Rpb24odHlwZSwgc291cmNlKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHZhciBzaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIodHlwZSk7XG5cdFx0aWYgKCFzaGFkZXIpIC8vc2hvdWxkIG5vdCBvY2N1ci4uLlxuXHRcdFx0cmV0dXJuIC0xO1xuXG5cdFx0Z2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKTtcblx0XHRnbC5jb21waWxlU2hhZGVyKHNoYWRlcik7XG5cdFx0XG5cdFx0aWYgKCFnbC5nZXRTaGFkZXJQYXJhbWV0ZXIoc2hhZGVyLCBnbC5DT01QSUxFX1NUQVRVUykgKSB7XG5cdFx0XHR2YXIgbG9nID0gZ2wuZ2V0U2hhZGVySW5mb0xvZyhzaGFkZXIpO1xuXHRcdFx0aWYgKGxvZyA9PT0gbnVsbCkgLy9tYXkgcmV0dXJuIG51bGwgYXMgcGVyIFdlYkdMIHNwZWNcblx0XHRcdFx0bG9nID0gXCJFcnJvciBleGVjdXRpbmcgZ2V0U2hhZGVySW5mb0xvZ1wiO1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vd2UgZG8gdGhpcyBzbyB0aGUgdXNlciBrbm93cyB3aGljaCBzaGFkZXIgaGFzIHRoZSBlcnJvclxuXHRcdFx0XHR2YXIgdHlwZVN0ciA9ICh0eXBlID09PSBnbC5WRVJURVhfU0hBREVSKSA/IFwidmVydGV4XCIgOiBcImZyYWdtZW50XCI7XG5cdFx0XHRcdGxvZyA9IFwiRXJyb3IgY29tcGlsaW5nIFwiKyB0eXBlU3RyKyBcIiBzaGFkZXI6XFxuXCIrbG9nO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbG9nO1xuXHRcdH1cblx0XHRyZXR1cm4gc2hhZGVyO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBpbmZvIChzaXplLCB0eXBlLCBsb2NhdGlvbikuXG5cdCAqIElmIHRoZSB1bmlmb3JtIGlzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUsIGl0IGlzIGFzc3VtZWRcblx0ICogdG8gbm90IGV4aXN0LCBhbmQgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKlxuXHQgKiBUaGlzIG1heSByZXR1cm4gbnVsbCBldmVuIGlmIHRoZSB1bmlmb3JtIGlzIGRlZmluZWQgaW4gR0xTTDpcblx0ICogaWYgaXQgaXMgX2luYWN0aXZlXyAoaS5lLiBub3QgdXNlZCBpbiB0aGUgcHJvZ3JhbSkgdGhlbiBpdCBtYXlcblx0ICogYmUgb3B0aW1pemVkIG91dC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtPYmplY3R9IGFuIG9iamVjdCBjb250YWluaW5nIGxvY2F0aW9uLCBzaXplLCBhbmQgdHlwZVxuXHQgKi9cblx0Z2V0VW5pZm9ybUluZm86IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy51bmlmb3JtQ2FjaGUuaGFzT3duUHJvcGVydHkobmFtZSkgXG5cdFx0XHQ/IHRoaXMudW5pZm9ybUNhY2hlW25hbWVdIDogbnVsbDsgXG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCBhdHRyaWJ1dGUgaW5mbyAoc2l6ZSwgdHlwZSwgbG9jYXRpb24pLlxuXHQgKiBJZiB0aGUgYXR0cmlidXRlIGlzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUsIGl0IGlzIGFzc3VtZWRcblx0ICogdG8gbm90IGV4aXN0LCBhbmQgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKlxuXHQgKiBUaGlzIG1heSByZXR1cm4gbnVsbCBldmVuIGlmIHRoZSBhdHRyaWJ1dGUgaXMgZGVmaW5lZCBpbiBHTFNMOlxuXHQgKiBpZiBpdCBpcyBfaW5hY3RpdmVfIChpLmUuIG5vdCB1c2VkIGluIHRoZSBwcm9ncmFtIG9yIGRpc2FibGVkKSBcblx0ICogdGhlbiBpdCBtYXkgYmUgb3B0aW1pemVkIG91dC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgYXR0cmlidXRlIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge29iamVjdH0gYW4gb2JqZWN0IGNvbnRhaW5pbmcgbG9jYXRpb24sIHNpemUgYW5kIHR5cGVcblx0ICovXG5cdGdldEF0dHJpYnV0ZUluZm86IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5hdHRyaWJ1dGVDYWNoZS5oYXNPd25Qcm9wZXJ0eShuYW1lKVxuXHRcdFx0PyB0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdIDogbnVsbDtcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBsb2NhdGlvbiBvYmplY3QuXG5cdCAqIElmIHRoZSB1bmlmb3JtIGlzIG5vdCBmb3VuZCwgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge0dMaW50fSB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqL1xuXHRnZXRBdHRyaWJ1dGVMb2NhdGlvbjogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmF0dHJpYnV0ZUNhY2hlLmhhc093blByb3BlcnR5KG5hbWUpIFxuXHRcdFx0JiYgdGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXSAhPT0gbnVsbFxuXHRcdFx0XHRcdD8gdGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXS5sb2NhdGlvbiBcblx0XHRcdFx0XHQ6IG51bGw7IFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBsb2NhdGlvbiBvYmplY3QuXG5cdCAqIElmIHRoZSB1bmlmb3JtIGlzIG5vdCBmb3VuZCwgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge1dlYkdMVW5pZm9ybUxvY2F0aW9ufSB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqL1xuXHRnZXRVbmlmb3JtTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy51bmlmb3JtQ2FjaGUuaGFzT3duUHJvcGVydHkobmFtZSkgXG5cdFx0XHQmJiB0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSAhPT0gbnVsbFxuXHRcdFx0XHRcdD8gdGhpcy51bmlmb3JtQ2FjaGVbbmFtZV0ubG9jYXRpb24gXG5cdFx0XHRcdFx0OiBudWxsOyBcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSB1bmlmb3JtIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgdW5pZm9ybSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgZm91bmQgYW5kIGFjdGl2ZVxuXHQgKi9cblx0aGFzVW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldFVuaWZvcm1JbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBhY3RpdmUgYW5kIGZvdW5kIGluIHRoaXNcblx0ICogY29tcGlsZWQgcHJvZ3JhbS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gIG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBdHRyaWJ1dGVJbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGJ5IG5hbWUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7YW55fSBUaGUgdmFsdWUgb2YgdGhlIFdlYkdMIHVuaWZvcm1cblx0ICovXG5cdGdldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nbC5nZXRVbmlmb3JtKHRoaXMucHJvZ3JhbSwgdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSkpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGF0IHRoZSBzcGVjaWZpZWQgV2ViR0xVbmlmb3JtTG9jYXRpb24uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtXZWJHTFVuaWZvcm1Mb2NhdGlvbn0gbG9jYXRpb24gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKiBAcmV0dXJuIHthbnl9IFRoZSB2YWx1ZSBvZiB0aGUgV2ViR0wgdW5pZm9ybVxuXHQgKi9cblx0Z2V0VW5pZm9ybUF0OiBmdW5jdGlvbihsb2NhdGlvbikge1xuXHRcdHJldHVybiB0aGlzLmdsLmdldFVuaWZvcm0odGhpcy5wcm9ncmFtLCBsb2NhdGlvbik7XG5cdH0sXG5cdFxuXHRzZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lLCB0eXBlLCBhcmdzKSB7XG5cdFx0Ly9maXJzdCBsb29rIGluIGNhY2hlXG5cdFx0Ly9pZiBub3QgZm91bmQsXG5cdH0sXG5cblx0Z2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXG5cdH0sXG5cblx0YmluZDogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbC51c2VQcm9ncmFtKHRoaXMuc2hhZGVyUHJvZ3JhbSk7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy5mcmFnU2hhZGVyKTtcblxuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlUHJvZ3JhbSh0aGlzLnNoYWRlclByb2dyYW0pO1xuXHRcdHRoaXMuc2hhZGVyUHJvZ3JhbSA9IG51bGw7XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNoYWRlclByb2dyYW07IiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxudmFyIFRleHR1cmUgPSBuZXcgQ2xhc3Moe1xuXG5cdGlkOiBudWxsLFxuXHR0YXJnZXQ6IG51bGwsXG5cdHdpZHRoOiAwLFxuXHRoZWlnaHQ6IDAsXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oZ2wsIHRhcmdldCkge1xuXHRcdGlmICghZ2wpXG5cdFx0XHR0aHJvdyBcIm5vIEdMIGNvbnRleHQgc3BlY2lmaWVkXCI7XG5cdFx0dGhpcy5nbCA9IGdsO1xuXHRcdHRoaXMudGFyZ2V0ID0gdGFyZ2V0IHx8IGdsLlRFWFRVUkVfMkQ7XG5cdFx0dGhpcy5pZCA9IGdsLmNyZWF0ZVRleHR1cmUoKTtcblx0XHR0aGlzLndpZHRoID0gdGhpcy5oZWlnaHQgPSAwO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIGxvdy1sZXZlbCBtZXRob2QgdG8gdXBsb2FkIHRoZSBzcGVjaWZpZWQgQXJyYXlCdWZmZXJWaWV3XG5cdCAqIHRvIHRoaXMgdGV4dHVyZS4gVGhpcyB3aWxsIGNhdXNlIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IG9mIHRoaXNcblx0ICogdGV4dHVyZSB0byBjaGFuZ2UuXG5cdCAqIFxuXHQgKiBbdXBsb2FkRGF0YSBkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7QXJyYXlCdWZmZXJWaWV3fSBkYXRhICB0aGUgcmF3IGRhdGEgZm9yIHRoaXMgdGV4dHVyZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICAgICAgICAgIHRoZSBuZXcgd2lkdGggb2YgdGhpcyB0ZXh0dXJlLFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRzIHRvIHRoZSBsYXN0IHVzZWQgd2lkdGggKG9yIHplcm8pXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICAgICAgICAgdGhlIG5ldyBoZWlnaHQgb2YgdGhpcyB0ZXh0dXJlXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHMgdG8gdGhlIGxhc3QgdXNlZCBoZWlnaHQgKG9yIHplcm8pXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gZm9ybWF0ICAgICAgICAgdGhlIGRhdGEgZm9ybWF0LCBkZWZhdWx0IFJHQkFcblx0ICogQHBhcmFtICB7R0xlbnVtfSB0eXBlICAgICAgICAgICB0aGUgZGF0YSB0eXBlLCBkZWZhdWx0IFVOU0lHTkVEX0JZVEUgKFVpbnQ4QXJyYXkpXG5cdCAqL1xuXHR1cGxvYWREYXRhOiBmdW5jdGlvbihkYXRhLCB3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdFxuXHRcdHRoaXMud2lkdGggPSAod2lkdGggfHwgd2lkdGg9PTApID8gd2lkdGggOiB0aGlzLndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gKGhlaWdodCB8fCBoZWlnaHQ9PTApID8gaGVpZ2h0IDogdGhpcy5oZWlnaHQ7XG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdGdsLnRleEltYWdlMkQodGhpcy50YXJnZXQsIDAsIHRoaXMuZm9ybWF0LCBcblx0XHRcdFx0XHQgIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCAwLCB0aGlzLmZvcm1hdCxcblx0XHRcdFx0XHQgIHR5cGUsIGRhdGEpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBVcGxvYWRzIEltYWdlRGF0YSwgSFRNTEltYWdlRWxlbWVudCwgSFRNTENhbnZhc0VsZW1lbnQgb3IgXG5cdCAqIEhUTUxWaWRlb0VsZW1lbnQuXG5cdCAqIFx0XG5cdCAqIEBwYXJhbSAge09iamVjdH0gZG9tT2JqZWN0IHRoZSBET00gaW1hZ2UgY29udGFpbmVyXG5cdCAqL1xuXHR1cGxvYWRJbWFnZTogZnVuY3Rpb24oZG9tT2JqZWN0LCBmb3JtYXQsIHR5cGUpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdFxuXHRcdHRoaXMud2lkdGggPSBkb21PYmplY3Qud2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSBkb21PYmplY3QuaGVpZ2h0O1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmZvcm1hdCwgdGhpcy5mb3JtYXQsXG5cdFx0XHRcdFx0ICB0eXBlLCBkb21PYmplY3QpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBCaW5kcyB0aGUgdGV4dHVyZS4gSWYgdW5pdCBpcyBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgYmluZCB0aGUgdGV4dHVyZSBhdCB0aGUgZ2l2ZW4gc2xvdFxuXHQgKiAoVEVYVFVSRTAsIFRFWFRVUkUxLCBldGMpLiBJZiB1bml0IGlzIG5vdCBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgc2ltcGx5IGJpbmQgdGhlIHRleHR1cmUgYXQgd2hpY2hldmVyIHNsb3Rcblx0ICogaXMgY3VycmVudGx5IGFjdGl2ZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdW5pdCB0aGUgdGV4dHVyZSB1bml0IGluZGV4LCBzdGFydGluZyBhdCAwXG5cdCAqL1xuXHRiaW5kOiBmdW5jdGlvbih1bml0KSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRpZiAodW5pdCB8fCB1bml0ID09PSAwKVxuXHRcdFx0Z2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCArIHVuaXQpO1xuXHRcdGdsLmJpbmRUZXh0dXJlKHRoaXMudGFyZ2V0LCB0aGlzLmlkKTtcblx0fVxufSk7XG5cblRleHR1cmUuRmlsdGVyID0ge1xuXHRORUFSRVNUOiA5NzI4LFxuXHRORUFSRVNUX01JUE1BUF9MSU5FQVI6IDk5ODYsXG5cdE5FQVJFU1RfTUlQTUFQX05FQVJFU1Q6IDk5ODQsXG5cdExJTkVBUjogOTcyOSxcblx0TElORUFSX01JUE1BUF9MSU5FQVI6IDk5ODcsXG5cdExJTkVBUl9NSVBNQVBfTkVBUkVTVDogOTk4NVxufTtcblRleHR1cmUuV3JhcCA9IHtcblx0Q0xBTVBfVE9fRURHRTogMzMwNzEsXG5cdE1JUlJPUkVEX1JFUEVBVDogMzM2NDgsXG5cdFJFUEVBVDogMTA0OTdcbn07XG5cbi8vVW5tYW5hZ2VkIHRleHR1cmVzOlxuLy9cdEhUTUwgZWxlbWVudHMgbGlrZSBJbWFnZSwgVmlkZW8sIENhbnZhc1xuLy9cdHBpeGVscyBidWZmZXIgZnJvbSBDYW52YXNcbi8vXHRwaXhlbHMgYXJyYXlcblxuLy9OZWVkIHNwZWNpYWwgaGFuZGxpbmc6XG4vLyAgY29udGV4dC5vbkNvbnRleHRMb3N0LmFkZChmdW5jdGlvbigpIHtcbi8vICBcdGNyZWF0ZUR5bmFtaWNUZXh0dXJlKCk7XG4vLyAgfS5iaW5kKHRoaXMpKTtcblxuLy9NYW5hZ2VkIHRleHR1cmVzOlxuLy9cdGltYWdlcyBzcGVjaWZpZWQgd2l0aCBhIHBhdGhcbi8vXHR0aGlzIHdpbGwgdXNlIEltYWdlIHVuZGVyIHRoZSBob29kXG5cblxuXG5tb2R1bGUuZXhwb3J0cyA9IFRleHR1cmU7IiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxudmFyIFdlYkdMQ2FudmFzID0gbmV3IENsYXNzKHtcblx0Ly9leHRlbmQgYSBiYXNlIGNsYXNzISFcdFxuXHRcblx0dGV4dHVyZUNhY2hlOiBudWxsLFxuXHRzaGFkZXJDYWNoZTogbnVsbCxcblx0XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIHZpZXcsIGNvbnRleHRBdHRyaWJ1dGVzKSB7XG5cdFx0Ly9zZXR1cCBkZWZhdWx0c1xuXHRcdHRoaXMudmlldyA9IHZpZXcgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcblxuXHRcdC8vZGVmYXVsdCBzaXplIGFzIHBlciBzcGVjOlxuXHRcdC8vaHR0cDovL3d3dy53My5vcmcvVFIvMjAxMi9XRC1odG1sNS1hdXRob3ItMjAxMjAzMjkvdGhlLWNhbnZhcy1lbGVtZW50Lmh0bWwjdGhlLWNhbnZhcy1lbGVtZW50XG5cdFx0dGhpcy53aWR0aCA9IHRoaXMudmlldy53aWR0aCA9IHdpZHRoIHx8IDMwMDtcblx0XHR0aGlzLmhlaWdodCA9IHRoaXMudmlldy5oZWlnaHQgPSBoZWlnaHQgfHwgMTUwO1xuXHRcdFxuXHRcdC8vc2V0dXAgY29udGV4dCBsb3N0IGFuZCByZXN0b3JlIGxpc3RlbmVyc1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0bG9zdFwiLCBmdW5jdGlvbiAoZXYpIHtcblx0XHRcdHRoaXMuX2NvbnRleHRMb3N0KGV2KTtcblx0XHR9LmJpbmQodGhpcykpO1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0cmVzdG9yZWRcIiwgZnVuY3Rpb24gKGV2KSB7XG5cdFx0XHR0aGlzLl9jb250ZXh0UmVzdG9yZWQoZXYpO1xuXHRcdH0uYmluZCh0aGlzKSk7XG5cdFx0XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuZ2wgPSB0aGlzLnZpZXcuZ2V0Q29udGV4dChcIndlYmdsXCIsIGNvbnRleHRBdHRyaWJ1dGVzKSBcblx0XHRcdFx0XHRcdHx8IHRoaXMudmlldy5nZXRDb250ZXh0KFwiZXhwZXJpbWVudGFsLXdlYmdsXCIsIGNvbnRleHRBdHRyaWJ1dGVzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvdyBcIldlYkdMIENvbnRleHQgTm90IFN1cHBvcnRlZCAtLSB0cnkgZW5hYmxpbmcgaXQgb3IgdXNpbmcgYSBkaWZmZXJlbnQgYnJvd3NlclxcblwiXG5cdFx0XHRcdCsgZTsgLy9wcmludCBlcnIgbXNnXG5cdFx0fVxuXHR9LFxuXG5cdGluaXRHTDogZnVuY3Rpb24oKSB7XG5cblx0fSxcblxuXHRfY29udGV4dExvc3Q6IGZ1bmN0aW9uKGV2KSB7XG5cdFx0Ly9hbGwgdGV4dHVyZXMvc2hhZGVycy9idWZmZXJzL0ZCT3MgaGF2ZSBiZWVuIGRlbGV0ZWQuLi4gXG5cdFx0Ly93ZSBuZWVkIHRvIHJlLWNyZWF0ZSB0aGVtIG9uIHJlc3RvcmVcblx0fSxcblxuXHRfY29udGV4dFJlc3RvcmVkOiBmdW5jdGlvbihldikge1xuXHRcdFxuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXZWJHTENhbnZhczsiLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0U2hhZGVyUHJvZ3JhbTogcmVxdWlyZSgnLi9TaGFkZXJQcm9ncmFtJyksXG5cdFdlYkdMQ2FudmFzOiByZXF1aXJlKCcuL1dlYkdMQ2FudmFzJyksXG5cdFRleHR1cmU6IHJlcXVpcmUoJy4vVGV4dHVyZScpXG59OyIsInZhciBDbGFzcyA9IHJlcXVpcmUoJy4vbGliL0NsYXNzJyksXG5cdEVudW0gPSByZXF1aXJlKCcuL2xpYi9FbnVtJyksXG5cdEludGVyZmFjZSA9IHJlcXVpcmUoJy4vbGliL0ludGVyZmFjZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0Q2xhc3M6IENsYXNzLFxuXHRFbnVtOiBFbnVtLFxuXHRJbnRlcmZhY2U6IEludGVyZmFjZVxufTsiLCJ2YXIgQmFzZUNsYXNzID0gcmVxdWlyZSgnLi9iYXNlQ2xhc3MnKTtcblxudmFyIENsYXNzID0gZnVuY3Rpb24oIGRlc2NyaXB0b3IgKSB7XG5cdGlmICghZGVzY3JpcHRvcikgXG5cdFx0ZGVzY3JpcHRvciA9IHt9O1xuXHRcblx0aWYoIGRlc2NyaXB0b3IuaW5pdGlhbGl6ZSApIHtcblx0XHR2YXIgclZhbCA9IGRlc2NyaXB0b3IuaW5pdGlhbGl6ZTtcblx0XHRkZWxldGUgZGVzY3JpcHRvci5pbml0aWFsaXplO1xuXHR9IGVsc2Uge1xuXHRcdHJWYWwgPSBmdW5jdGlvbigpIHsgdGhpcy5wYXJlbnQuYXBwbHkoIHRoaXMsIGFyZ3VtZW50cyApOyB9O1xuXHR9XG5cblx0aWYoIGRlc2NyaXB0b3IuRXh0ZW5kcyApIHtcblx0XHRyVmFsLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoIGRlc2NyaXB0b3IuRXh0ZW5kcy5wcm90b3R5cGUgKTtcblx0XHQvLyB0aGlzIHdpbGwgYmUgdXNlZCB0byBjYWxsIHRoZSBwYXJlbnQgY29uc3RydWN0b3Jcblx0XHRyVmFsLiQkcGFyZW50Q29uc3RydWN0b3IgPSBkZXNjcmlwdG9yLkV4dGVuZHM7XG5cdFx0ZGVsZXRlIGRlc2NyaXB0b3IuRXh0ZW5kcztcblx0fSBlbHNlIHtcblx0XHRyVmFsLiQkcGFyZW50Q29uc3RydWN0b3IgPSBmdW5jdGlvbigpIHt9XG5cdFx0clZhbC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKCBCYXNlQ2xhc3MgKTtcblx0fVxuXG5cdHJWYWwucHJvdG90eXBlLiQkZ2V0dGVycyA9IHt9O1xuXHRyVmFsLnByb3RvdHlwZS4kJHNldHRlcnMgPSB7fTtcblxuXHRmb3IoIHZhciBpIGluIGRlc2NyaXB0b3IgKSB7XG5cdFx0aWYoIHR5cGVvZiBkZXNjcmlwdG9yWyBpIF0gPT0gJ2Z1bmN0aW9uJyApIHtcblx0XHRcdGRlc2NyaXB0b3JbIGkgXS4kJG5hbWUgPSBpO1xuXHRcdFx0ZGVzY3JpcHRvclsgaSBdLiQkb3duZXIgPSByVmFsLnByb3RvdHlwZTtcblxuXHRcdFx0clZhbC5wcm90b3R5cGVbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXTtcblx0XHR9IGVsc2UgaWYoIGRlc2NyaXB0b3JbIGkgXSAmJiB0eXBlb2YgZGVzY3JpcHRvclsgaSBdID09ICdvYmplY3QnICYmICggZGVzY3JpcHRvclsgaSBdLmdldCB8fCBkZXNjcmlwdG9yWyBpIF0uc2V0ICkgKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoIHJWYWwucHJvdG90eXBlLCBpICwgZGVzY3JpcHRvclsgaSBdICk7XG5cblx0XHRcdGlmKCBkZXNjcmlwdG9yWyBpIF0uZ2V0ICkge1xuXHRcdFx0XHRyVmFsLnByb3RvdHlwZS4kJGdldHRlcnNbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXS5nZXQ7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5nZXQuJCRuYW1lID0gaTtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLmdldC4kJG93bmVyID0gclZhbC5wcm90b3R5cGU7XG5cdFx0XHR9XG5cblx0XHRcdGlmKCBkZXNjcmlwdG9yWyBpIF0uc2V0ICkge1xuXHRcdFx0XHRyVmFsLnByb3RvdHlwZS4kJHNldHRlcnNbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXS5zZXQ7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5zZXQuJCRuYW1lID0gaTtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLnNldC4kJG93bmVyID0gclZhbC5wcm90b3R5cGU7XHRcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0clZhbC5wcm90b3R5cGVbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXTtcblx0XHR9XG5cdH1cblxuXHQvLyB0aGlzIHdpbGwgYmUgdXNlZCB0byBjaGVjayBpZiB0aGUgY2FsbGVyIGZ1bmN0aW9uIGlzIHRoZSBjb25zcnVjdG9yXG5cdHJWYWwuJCRpc0NvbnN0cnVjdG9yID0gdHJ1ZTtcblxuXG5cdC8vIG5vdyB3ZSdsbCBjaGVjayBpbnRlcmZhY2VzXG5cdGZvciggdmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrICkge1xuXHRcdGFyZ3VtZW50c1sgaSBdLmNvbXBhcmUoIHJWYWwgKTtcblx0fVxuXG5cdHJldHVybiByVmFsO1xufTtcdFxuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCcuL0NsYXNzJyk7XG5cbi8qKlxuVGhlIEVudW0gY2xhc3MsIHdoaWNoIGhvbGRzIGEgc2V0IG9mIGNvbnN0YW50cyBpbiBhIGZpeGVkIG9yZGVyLlxuXG4jIyMjIEJhc2ljIFVzYWdlOlxuXHR2YXIgRGF5cyA9IG5ldyBFbnVtKFsgXG5cdFx0XHQnTW9uZGF5Jyxcblx0XHRcdCdUdWVzZGF5Jyxcblx0XHRcdCdXZWRuZXNkYXknLFxuXHRcdFx0J1RodXJzZGF5Jyxcblx0XHRcdCdGcmlkYXknLFxuXHRcdFx0J1NhdHVyZGF5Jyxcblx0XHRcdCdTdW5kYXknXG5cdF0pO1xuXG5cdGNvbnNvbGUubG9nKCBEYXlzLk1vbmRheSA9PT0gRGF5cy5UdWVzZGF5ICk7IC8vID0+IGZhbHNlXG5cdGNvbnNvbGUubG9nKCBEYXlzLnZhbHVlc1sxXSApIC8vID0+IHRoZSAnVHVlc2RheScgc3ltYm9sIG9iamVjdFxuXG5FYWNoIGVudW0gKnN5bWJvbCogaXMgYW4gb2JqZWN0IHdoaWNoIGV4dGVuZHMgZnJvbSB0aGUgYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWAgXG5jbGFzcy4gVGhpcyBiYXNlXG5jbGFzcyBoYXMgIHByb3BlcnRpZXMgbGlrZSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlL3ZhbHVlOnByb3BlcnR5XCJ9fXt7L2Nyb3NzTGlua319YCAgXG5hbmQgYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZS9vcmRpbmFsOnByb3BlcnR5XCJ9fXt7L2Nyb3NzTGlua319YC4gXG5fX2B2YWx1ZWBfXyBpcyBhIHN0cmluZ1xud2hpY2ggbWF0Y2hlcyB0aGUgZWxlbWVudCBvZiB0aGUgYXJyYXkuIF9fYG9yZGluYWxgX18gaXMgdGhlIGluZGV4IHRoZSBcbnN5bWJvbCB3YXMgZGVmaW5lZCBhdCBpbiB0aGUgZW51bWVyYXRpb24uIFxuXG5UaGUgcmVzdWx0aW5nIEVudW0gb2JqZWN0IChpbiB0aGUgYWJvdmUgY2FzZSwgRGF5cykgYWxzbyBoYXMgc29tZSB1dGlsaXR5IG1ldGhvZHMsXG5saWtlIGZyb21WYWx1ZShzdHJpbmcpIGFuZCB0aGUgdmFsdWVzIHByb3BlcnR5IHRvIGFjY2VzcyB0aGUgYXJyYXkgb2Ygc3ltYm9scy5cblxuTm90ZSB0aGF0IHRoZSB2YWx1ZXMgYXJyYXkgaXMgZnJvemVuLCBhcyBpcyBlYWNoIHN5bWJvbC4gVGhlIHJldHVybmVkIG9iamVjdCBpcyBcbl9fbm90X18gZnJvemVuLCBhcyB0byBhbGxvdyB0aGUgdXNlciB0byBtb2RpZnkgaXQgKGkuZS4gYWRkIFwic3RhdGljXCIgbWVtYmVycykuXG5cbkEgbW9yZSBhZHZhbmNlZCBFbnVtIHVzYWdlIGlzIHRvIHNwZWNpZnkgYSBiYXNlIEVudW0gc3ltYm9sIGNsYXNzIGFzIHRoZSBzZWNvbmRcbnBhcmFtZXRlci4gVGhpcyBpcyB0aGUgY2xhc3MgdGhhdCBlYWNoIHN5bWJvbCB3aWxsIHVzZS4gVGhlbiwgaWYgYW55IHN5bWJvbHNcbmFyZSBnaXZlbiBhcyBhbiBBcnJheSAoaW5zdGVhZCBvZiBzdHJpbmcpLCBpdCB3aWxsIGJlIHRyZWF0ZWQgYXMgYW4gYXJyYXkgb2YgYXJndW1lbnRzXG50byB0aGUgYmFzZSBjbGFzcy4gVGhlIGZpcnN0IGFyZ3VtZW50IHNob3VsZCBhbHdheXMgYmUgdGhlIGRlc2lyZWQga2V5IG9mIHRoYXQgc3ltYm9sLlxuXG5Ob3RlIHRoYXQgX19gb3JkaW5hbGBfXyBpcyBhZGRlZCBkeW5hbWljYWxseVxuYWZ0ZXIgdGhlIHN5bWJvbCBpcyBjcmVhdGVkOyBzbyBpdCBjYW4ndCBiZSB1c2VkIGluIHRoZSBzeW1ib2wncyBjb25zdHJ1Y3Rvci5cblxuIyMjIyBBZHZhbmNlZCBVc2FnZVxuXHR2YXIgRGF5cyA9IG5ldyBFbnVtKFsgXG5cdFx0XHQnTW9uZGF5Jyxcblx0XHRcdCdUdWVzZGF5Jyxcblx0XHRcdCdXZWRuZXNkYXknLFxuXHRcdFx0J1RodXJzZGF5Jyxcblx0XHRcdCdGcmlkYXknLFxuXHRcdFx0WydTYXR1cmRheScsIHRydWVdLFxuXHRcdFx0WydTdW5kYXknLCB0cnVlXVxuXHRcdF0sIG5ldyBDbGFzcyh7XG5cdFx0XHRcblx0XHRcdEV4dGVuZHM6IEVudW0uQmFzZSxcblxuXHRcdFx0aXNXZWVrZW5kOiBmYWxzZSxcblxuXHRcdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oIGtleSwgaXNXZWVrZW5kICkge1xuXHRcdFx0XHQvL3Bhc3MgdGhlIHN0cmluZyB2YWx1ZSBhbG9uZyB0byBwYXJlbnQgY29uc3RydWN0b3Jcblx0XHRcdFx0dGhpcy5wYXJlbnQoIGtleSApOyBcblx0XHRcdFx0XG5cdFx0XHRcdC8vZ2V0IGEgYm9vbGVhbiBwcmltaXRpdmUgb3V0IG9mIHRoZSB0cnV0aHkvZmFsc3kgdmFsdWVcblx0XHRcdFx0dGhpcy5pc1dla2VlbmQgPSBCb29sZWFuKGlzV2Vla2VuZCk7XG5cdFx0XHR9XG5cdFx0fSlcblx0KTtcblxuXHRjb25zb2xlLmxvZyggRGF5cy5TYXR1cmRheS5pc1dlZWtlbmQgKTsgLy8gPT4gdHJ1ZVxuXG5UaGlzIG1ldGhvZCB3aWxsIHRocm93IGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gc3BlY2lmeSBhIGNsYXNzIHdoaWNoIGRvZXNcbm5vdCBleHRlbmQgZnJvbSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YC5cblxuIyMjIyBTaG9ydGhhbmRcblxuWW91IGNhbiBhbHNvIG9taXQgdGhlIGBuZXcgQ2xhc3NgIGFuZCBwYXNzIGEgZGVzY3JpcHRvciwgdGh1cyByZWR1Y2luZyB0aGUgbmVlZCB0byBcbmV4cGxpY2l0bHkgcmVxdWlyZSB0aGUgQ2xhc3MgbW9kdWxlLiBGdXJ0aGVyLCBpZiB5b3UgYXJlIHBhc3NpbmcgYSBkZXNjcmlwdG9yIHRoYXRcbmRvZXMgbm90IGhhdmUgYEV4dGVuZHNgIGRlZmluZWQsIGl0IHdpbGwgZGVmYXVsdCB0b1xuYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWAuXG5cblx0dmFyIEljb25zID0gbmV3IEVudW0oWyBcblx0XHRcdCdPcGVuJyxcblx0XHRcdCdTYXZlJyxcblx0XHRcdCdIZWxwJyxcblx0XHRcdCdOZXcnXG5cdFx0XSwge1xuXG5cdFx0XHRwYXRoOiBmdW5jdGlvbiggcmV0aW5hICkge1xuXHRcdFx0XHRyZXR1cm4gXCJpY29ucy9cIiArIHRoaXMudmFsdWUudG9Mb3dlckNhc2UoKSArIChyZXRpbmEgPyBcIkAyeFwiIDogXCJcIikgKyBcIi5wbmdcIjtcblx0XHRcdH1cblx0XHR9XG5cdCk7XG5cblxuQGNsYXNzIEVudW1cbkBjb25zdHJ1Y3RvciBcbkBwYXJhbSB7QXJyYXl9IGVsZW1lbnRzIEFuIGFycmF5IG9mIGVudW1lcmF0ZWQgY29uc3RhbnRzLCBvciBhcmd1bWVudHMgdG8gYmUgcGFzc2VkIHRvIHRoZSBzeW1ib2xcbkBwYXJhbSB7Q2xhc3N9IGJhc2UgQ2xhc3MgdG8gYmUgaW5zdGFudGlhdGVkIGZvciBlYWNoIGVudW0gc3ltYm9sLCBtdXN0IGV4dGVuZCBcbmB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2VcIn19e3svY3Jvc3NMaW5rfX1gXG4qL1xudmFyIEVudW1SZXN1bHQgPSBuZXcgQ2xhc3Moe1xuXG5cdC8qKlxuXHRBbiBhcnJheSBvZiB0aGUgZW51bWVyYXRlZCBzeW1ib2wgb2JqZWN0cy5cblxuXHRAcHJvcGVydHkgdmFsdWVzXG5cdEB0eXBlIEFycmF5XG5cdCovXG5cdHZhbHVlczogbnVsbCxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy52YWx1ZXMgPSBbXTtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBcIlsgXCIrdGhpcy52YWx1ZXMuam9pbihcIiwgXCIpK1wiIF1cIjtcblx0fSxcblxuXHQvKipcblx0TG9va3MgZm9yIHRoZSBmaXJzdCBzeW1ib2wgaW4gdGhpcyBlbnVtIHdob3NlICd2YWx1ZScgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIHN0cmluZy4gXG5cdElmIG5vbmUgYXJlIGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cblx0QG1ldGhvZCBmcm9tVmFsdWVcblx0QHBhcmFtIHtTdHJpbmd9IHN0ciB0aGUgc3RyaW5nIHRvIGxvb2sgdXBcblx0QHJldHVybiB7RW51bS5CYXNlfSByZXR1cm5zIGFuIGVudW0gc3ltYm9sIGZyb20gdGhlIGdpdmVuICd2YWx1ZScgc3RyaW5nLCBvciBudWxsXG5cdCovXG5cdGZyb21WYWx1ZTogZnVuY3Rpb24gKHN0cikge1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLnZhbHVlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHN0ciA9PT0gdGhpcy52YWx1ZXNbaV0udmFsdWUpXG5cdFx0XHRcdHJldHVybiB0aGlzLnZhbHVlc1tpXTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn0pO1xuXG5cblxudmFyIEVudW0gPSBmdW5jdGlvbiAoIGVsZW1lbnRzLCBiYXNlICkge1xuXHRpZiAoIWJhc2UpXG5cdFx0YmFzZSA9IEVudW0uQmFzZTtcblxuXHQvL1RoZSB1c2VyIGlzIG9taXR0aW5nIENsYXNzLCBpbmplY3QgaXQgaGVyZVxuXHRpZiAodHlwZW9mIGJhc2UgPT09IFwib2JqZWN0XCIpIHtcblx0XHQvL2lmIHdlIGRpZG4ndCBzcGVjaWZ5IGEgc3ViY2xhc3MuLiBcblx0XHRpZiAoIWJhc2UuRXh0ZW5kcylcblx0XHRcdGJhc2UuRXh0ZW5kcyA9IEVudW0uQmFzZTtcblx0XHRiYXNlID0gbmV3IENsYXNzKGJhc2UpO1xuXHR9XG5cdFxuXHR2YXIgcmV0ID0gbmV3IEVudW1SZXN1bHQoKTtcblxuXHRmb3IgKHZhciBpPTA7IGk8ZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHR2YXIgZSA9IGVsZW1lbnRzW2ldO1xuXG5cdFx0dmFyIG9iaiA9IG51bGw7XG5cdFx0dmFyIGtleSA9IG51bGw7XG5cblx0XHRpZiAoIWUpXG5cdFx0XHR0aHJvdyBcImVudW0gdmFsdWUgYXQgaW5kZXggXCIraStcIiBpcyB1bmRlZmluZWRcIjtcblxuXHRcdGlmICh0eXBlb2YgZSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0a2V5ID0gZTtcblx0XHRcdG9iaiA9IG5ldyBiYXNlKGUpO1xuXHRcdFx0cmV0W2VdID0gb2JqO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZSkpXG5cdFx0XHRcdHRocm93IFwiZW51bSB2YWx1ZXMgbXVzdCBiZSBTdHJpbmcgb3IgYW4gYXJyYXkgb2YgYXJndW1lbnRzXCI7XG5cblx0XHRcdGtleSA9IGVbMF07XG5cblx0XHRcdC8vZmlyc3QgYXJnIGlzIGlnbm9yZWRcblx0XHRcdGUudW5zaGlmdChudWxsKTtcblx0XHRcdG9iaiA9IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoYmFzZSwgZSkpO1xuXG5cdFx0XHRyZXRba2V5XSA9IG9iajtcblx0XHR9XG5cblx0XHRpZiAoICEob2JqIGluc3RhbmNlb2YgRW51bS5CYXNlKSApXG5cdFx0XHR0aHJvdyBcImVudW0gYmFzZSBjbGFzcyBtdXN0IGJlIGEgc3ViY2xhc3Mgb2YgRW51bS5CYXNlXCI7XG5cblx0XHRvYmoub3JkaW5hbCA9IGk7XG5cdFx0cmV0LnZhbHVlcy5wdXNoKG9iaik7XG5cdFx0T2JqZWN0LmZyZWV6ZShvYmopO1xuXHR9O1xuXG5cdC8vd2UgU0hPVUxEIGZyZWV6ZSB0aGUgcmV0dXJybmVkIG9iamVjdCwgYnV0IG1vc3QgSlMgZGV2ZWxvcGVyc1xuXHQvL2FyZW4ndCBleHBlY3RpbmcgYW4gb2JqZWN0IHRvIGJlIGZyb3plbiwgYW5kIHRoZSBicm93c2VycyBkb24ndCBhbHdheXMgd2FybiB1cy5cblx0Ly9JdCBqdXN0IGNhdXNlcyBmcnVzdHJhdGlvbiwgZS5nLiBpZiB5b3UncmUgdHJ5aW5nIHRvIGFkZCBhIHN0YXRpYyBvciBjb25zdGFudFxuXHQvL3RvIHRoZSByZXR1cm5lZCBvYmplY3QuXG5cblx0Ly8gT2JqZWN0LmZyZWV6ZShyZXQpO1xuXHRPYmplY3QuZnJlZXplKHJldC52YWx1ZXMpO1xuXHRyZXR1cm4gcmV0O1xufTtcblxuXG4vKipcblxuVGhlIGJhc2UgdHlwZSBmb3IgRW51bSBzeW1ib2xzLiBTdWJjbGFzc2VzIGNhbiBleHRlbmRcbnRoaXMgdG8gaW1wbGVtZW50IG1vcmUgZnVuY3Rpb25hbGl0eSBmb3IgZW51bSBzeW1ib2xzLlxuXG5AY2xhc3MgRW51bS5CYXNlXG5AY29uc3RydWN0b3IgXG5AcGFyYW0ge1N0cmluZ30ga2V5IHRoZSBzdHJpbmcgdmFsdWUgZm9yIHRoaXMgc3ltYm9sXG4qL1xuRW51bS5CYXNlID0gbmV3IENsYXNzKHtcblxuXHQvKipcblx0VGhlIHN0cmluZyB2YWx1ZSBvZiB0aGlzIHN5bWJvbC5cblx0QHByb3BlcnR5IHZhbHVlXG5cdEB0eXBlIFN0cmluZ1xuXHQqL1xuXHR2YWx1ZTogdW5kZWZpbmVkLFxuXG5cdC8qKlxuXHRUaGUgaW5kZXggb2YgdGhpcyBzeW1ib2wgaW4gaXRzIGVudW1lcmF0aW9uIGFycmF5LlxuXHRAcHJvcGVydHkgb3JkaW5hbFxuXHRAdHlwZSBOdW1iZXJcblx0Ki9cblx0b3JkaW5hbDogdW5kZWZpbmVkLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICgga2V5ICkge1xuXHRcdHRoaXMudmFsdWUgPSBrZXk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlIHx8IHRoaXMucGFyZW50KCk7XG5cdH0sXG5cblx0dmFsdWVPZjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgfHwgdGhpcy5wYXJlbnQoKTtcblx0fVxufSk7XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEVudW07XG4iLCJcbnZhciBJbnRlcmZhY2UgPSBmdW5jdGlvbiggZGVzY3JpcHRvciApIHtcblx0dGhpcy5kZXNjcmlwdG9yID0gZGVzY3JpcHRvcjtcbn07XG5cbkludGVyZmFjZS5wcm90b3R5cGUuZGVzY3JpcHRvciA9IG51bGw7XG5cbkludGVyZmFjZS5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uKCBjbGFzc1RvQ2hlY2sgKSB7XG5cblx0Zm9yKCB2YXIgaSAgaW4gdGhpcy5kZXNjcmlwdG9yICkge1xuXHRcdC8vIEZpcnN0IHdlJ2xsIGNoZWNrIGlmIHRoaXMgcHJvcGVydHkgZXhpc3RzIG9uIHRoZSBjbGFzc1xuXHRcdGlmKCBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0gPT09IHVuZGVmaW5lZCApIHtcblxuXHRcdFx0dGhyb3cgJ0lOVEVSRkFDRSBFUlJPUjogJyArIGkgKyAnIGlzIG5vdCBkZWZpbmVkIGluIHRoZSBjbGFzcyc7XG5cblx0XHQvLyBTZWNvbmQgd2UnbGwgY2hlY2sgdGhhdCB0aGUgdHlwZXMgZXhwZWN0ZWQgbWF0Y2hcblx0XHR9IGVsc2UgaWYoIHR5cGVvZiB0aGlzLmRlc2NyaXB0b3JbIGkgXSAhPSB0eXBlb2YgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiBJbnRlcmZhY2UgYW5kIGNsYXNzIGRlZmluZSBpdGVtcyBvZiBkaWZmZXJlbnQgdHlwZSBmb3IgJyArIGkgKyBcblx0XHRcdFx0ICAnXFxuaW50ZXJmYWNlWyAnICsgaSArICcgXSA9PSAnICsgdHlwZW9mIHRoaXMuZGVzY3JpcHRvclsgaSBdICtcblx0XHRcdFx0ICAnXFxuY2xhc3NbICcgKyBpICsgJyBdID09ICcgKyB0eXBlb2YgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdO1xuXG5cdFx0Ly8gVGhpcmQgaWYgdGhpcyBwcm9wZXJ0eSBpcyBhIGZ1bmN0aW9uIHdlJ2xsIGNoZWNrIHRoYXQgdGhleSBleHBlY3QgdGhlIHNhbWUgYW1vdW50IG9mIHBhcmFtZXRlcnNcblx0XHR9IGVsc2UgaWYoIHR5cGVvZiB0aGlzLmRlc2NyaXB0b3JbIGkgXSA9PSAnZnVuY3Rpb24nICYmIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXS5sZW5ndGggIT0gdGhpcy5kZXNjcmlwdG9yWyBpIF0ubGVuZ3RoICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiBJbnRlcmZhY2UgYW5kIGNsYXNzIGV4cGVjdCBhIGRpZmZlcmVudCBhbW91bnQgb2YgcGFyYW1ldGVycyBmb3IgdGhlIGZ1bmN0aW9uICcgKyBpICtcblx0XHRcdFx0ICAnXFxuRVhQRUNURUQ6ICcgKyB0aGlzLmRlc2NyaXB0b3JbIGkgXS5sZW5ndGggKyBcblx0XHRcdFx0ICAnXFxuUkVDRUlWRUQ6ICcgKyBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0ubGVuZ3RoO1xuXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBJbnRlcmZhY2U7IiwiLy9FeHBvcnRzIGEgZnVuY3Rpb24gbmFtZWQgJ3BhcmVudCdcbm1vZHVsZS5leHBvcnRzLnBhcmVudCA9IGZ1bmN0aW9uKCkge1xuXHQvLyBpZiB0aGUgY3VycmVudCBmdW5jdGlvbiBjYWxsaW5nIGlzIHRoZSBjb25zdHJ1Y3RvclxuXHRpZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkaXNDb25zdHJ1Y3RvciApIHtcblx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRwYXJlbnRDb25zdHJ1Y3Rvcjtcblx0fSBlbHNlIHtcblx0XHRpZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkbmFtZSApIHtcblx0XHRcdHZhciBjYWxsZXJOYW1lID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkbmFtZTtcblx0XHRcdHZhciBpc0dldHRlciA9IHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyLiQkZ2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXHRcdFx0dmFyIGlzU2V0dGVyID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIuJCRzZXR0ZXJzWyBjYWxsZXJOYW1lIF07XG5cblx0XHRcdGlmKCBhcmd1bWVudHMubGVuZ3RoID09IDEgJiYgaXNTZXR0ZXIgKSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKS4kJHNldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0XHRpZiggcGFyZW50RnVuY3Rpb24gPT09IHVuZGVmaW5lZCApIHtcblx0XHRcdFx0XHR0aHJvdyAnTm8gc2V0dGVyIGRlZmluZWQgaW4gcGFyZW50Jztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmKCBhcmd1bWVudHMubGVuZ3RoID09IDAgJiYgaXNHZXR0ZXIgKSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKS4kJGdldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0XHRpZiggcGFyZW50RnVuY3Rpb24gPT09IHVuZGVmaW5lZCApIHtcblx0XHRcdFx0XHR0aHJvdyAnTm8gZ2V0dGVyIGRlZmluZWQgaW4gcGFyZW50Jztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmKCBpc1NldHRlciB8fCBpc0dldHRlciApIHtcblx0XHRcdFx0dGhyb3cgJ0luY29ycmVjdCBhbW91bnQgb2YgYXJndW1lbnRzIHNlbnQgdG8gZ2V0dGVyIG9yIHNldHRlcic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoIHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyIClbIGNhbGxlck5hbWUgXTtcdFxuXG5cdFx0XHRcdGlmKCBwYXJlbnRGdW5jdGlvbiA9PT0gdW5kZWZpbmVkICkge1xuXHRcdFx0XHRcdHRocm93ICdObyBwYXJlbnQgZnVuY3Rpb24gZGVmaW5lZCBmb3IgJyArIGNhbGxlck5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgJ1lvdSBjYW5ub3QgY2FsbCBwYXJlbnQgaGVyZSc7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHBhcmVudEZ1bmN0aW9uLmFwcGx5KCB0aGlzLCBhcmd1bWVudHMgKTtcbn07Il19
;