## kami

Kami is a fast and lightweight WebGL sprite rendering framework. 

It is ideal for tinkering with WebGL, building your game engine on top of, or writing applications that require low-level control over vertex data, textures, and so forth. 

**This library is still in development.**

## Docs

... soon to be online ...

## Usage

Here is an example using Node style requires and browserify:

```javascript
//require the necessary classes from the 'kami' module
var AssetManager = require('kami').AssetManager;
var SpriteBatch = require('kami').SpriteBatch;

var WebGLContext = require('kami').WebGLContext;

var width = 256;
var height = 256;

//create our webGL context..
//this will manage viewport and context loss/restore
var context = new WebGLContext(width, height);

//add the GL canvas to the DOM
document.body.appendChild(context.view);

//Create a new batcher for 2D sprites
var batch = new SpriteBatch(context);

//Create a new texture. This will load the URL asynchronously
var tex0 = new Texture(context, "img/mysprite.png");

//kami aliases some Texture GLenums for convenience
tex0.setFilter(Texture.Filter.LINEAR);

//Start our render loop
requestAnimationFrame(render);

function render() {
	requestAnimationFrame(render);

	var gl = context.gl;

	//clear the GL canvas
	gl.clear(gl.COLOR_BUFFER_BIT);

	//start the batch...
	batch.begin();

	//draw the texture at (75, 75) with a size of 100x100
	batch.draw(tex0, 75, 75, 100, 100);

	//draw it some other places
	batch.draw(tex0, 0, 0, 15, 25);
	batch.draw(tex0, 100, 100);

	//flush sprites to GPU
	batch.end();
}
```

## demos

The `demos` folder is outdated and will be replaced by `kami-demos`, see here:   
https://github.com/mattdesl/kami-demos 

## Using without Node

If you aren't using Node and `require()` statements, you can grab the UMD build at `build/kami.js`. 

Most of the code looks exactly the same, except all of Kami's objects are exported onto a global `kami` namespace. The dependencies are also exported on the namespace, for convenience. See here:

```html
<script src="kami.js"></script>
<script>
	var context = new kami.WebGLContext(width, height);
	var batch = new kami.SpriteBatch(context);

	//js-signals dependency is on Kami namespace, too:
	var Signal = new kami.Signal();

	//so is "klasse" utility library, but aliased to Class:
	var MyClass = new kami.Class({
		//... class definition ...//
	});
	//etc...
</script>
```

## Road Map / TODOs

- WebGL2 utils: compressed textures, texture arrays, float textures, instanced draws, etc.
- Cube maps and other Texture utils
- clean up asset loading and kami-assets
- MRTs for FrameBuffer utility (WebGL2)
- SpriteBatch should use matrices (projeciton/transform) 
- SpriteBatch needs rotation