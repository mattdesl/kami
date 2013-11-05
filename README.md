## kami

Kami is a fast and lightweight WebGL sprite rendering framework. It can be used for 2D or 3D purposes, and aims to support modern WebGL features like compressed textures.

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

//Create an asset manager
//This re-loads everything for us on context loss...
var assets = new AssetManager(context);

//Add a new asset, this will return a Texture object 
//which we can use for drawing
var tex0 = assets.load("img/grass.png");

//Start our render loop
requestAnimationFrame(render);

function render() {
	requestAnimationFrame(render);

	//We update the assets every frame. This method returns
	//true when all assets have been updated.
	if (assets.update()) { //assets have been loaded.
		//Set the projection vector; the mid-point of your stage.
		batch.setProjection(width/2, height/2);

		//start the batch...
		batch.begin();

		//draw the texture at (75, 75) with a size of 100x100
		batch.draw(tex1, 75, 75, 100, 100);

		//flush to GPU
		batch.end();
	} else {
		//The images are loading... here might render a loading bar.
	}
}
```

See the `demos` folder for more. 

## Using without Node

If you aren't using Node and `require()` statements, you can grab the file at `build/kami.umd.js`. 

Most of the code looks exactly the same, except all of Kami's objects are exported onto a global `kami` namespace. The dependencies are also exported on the namespace, for convenience. See here:

```javascript
<script src="kami.umd.js"></script>
<script>
	var context = new kami.WebGLContext(width, height);
	var batch = new kami.SpriteBatch(context);

	//Dependencies (gl-matrix, signals-js, jsOOP) are all top-level, too:
	var point = kami.vec2.create();
	var Signal = new kami.Signal();
	//etc...
</script>
```

## Road Map

- WebGL2 utils: compressed textures, texture arrays, float textures, instanced draws, etc.
- Cube maps, mipmaps, and other Texture utils
- more AssetManager loader plugins
- FrameBuffer utility for render-to-texture (should support MRTs for WebGL2)
- Advanced batcher that batches up to 4 textures in a single draw call
- More shader examples