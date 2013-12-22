//We use browserify to alias the kami namespace,
//this way the code looks exactly the same in regular Node projects
 

var WebGLContext = require('kami').WebGLContext;
var Texture = require('kami').Texture;
var AssetManager = require('kami').AssetManager;
var SpriteBatch = require('kami').SpriteBatch;

$(function() {
	var mainContainer = $("body").css({
		background: "#343434"
	});

	var css = {
		position: "absolute",
		top: 20, 
		left: 50,
		zIndex: 0,
		fontSize: "40px",
		textTransform: "uppercase",
		color: "white", 
		fontWeight: "bold"
	};

	
	var width = 256;
	var height = 256;

	//create our webGL context..
	//this will manage viewport and context loss/restore
	var context = new WebGLContext(width, height, null, {
		alpha: true,
	});
	$(context.view).css({
		position: "absolute",
		top: 0,
		left: 0
	});

	//setup some text below & above
	$("<span>below text</span>")
		.css(css)
		.appendTo(mainContainer);

	//add the view to the body
	mainContainer.append(context.view);

	//setup some text below & above
	$("<span>above text</span>")
		.css(css)
		.css("top", 100)
		.appendTo(mainContainer);
	
	//We use this for rendering 2D sprites
	var batch = new SpriteBatch(context);

	//We use this to ensure that images are loaded before trying to render them
	var assets = new AssetManager(context);

	//This returns a Texture object
	var tex0 = assets.load("img/grass.png");
	var tex1 = assets.load("img/scene.png");

		
	//In WebGL, repeat wrapping only works with power-of-two images!
	tex0.setWrap(Texture.Wrap.REPEAT);

	//Start our render loop
	requestAnimationFrame(render);


	/// A procedurally-created texture. We could use this for things like
	/// lookup tables in a shader, or some cool graphics that aren't worth 
	/// doing in a shader.
	var fmt = Texture.Format.RGB;
	var type = Texture.DataType.UNSIGNED_BYTE;
	var texWidth = 1;
	var texHeight = 3;
	var data = new Uint8Array([
		255, 255, 255,
		255, 0, 0,
		255, 255, 255,
	]);

	var proceduralTex = new Texture(context, texWidth, texHeight, fmt, type, data);
	
	function render() {
		var gl = context.gl;

		requestAnimationFrame(render);

		//We update the assets every frame. This method returns
		//true when all assets have been updated.
		if (assets.update()) { //assets have been loaded.
			gl.clear(gl.COLOR_BUFFER_BIT);

			//Set the projection vector; the mid-point of your stage.
			batch.setProjection(width/2, height/2);

			//start the batch...
			batch.begin();

			//Set the alpha to 50%
			batch.setColor(0.5);
			batch.draw(tex0, 
						0, 0, 		  //x, y
						width, height,//width, height
						0, 0, 2, 2);  //we can adjust UVs to repeat easily
	
			batch.draw(tex0);

			//by default, we can specify colors as non-premultiplied:
			//Here we use red (R=1, G=0, B=0) with 50% opacity
			batch.setColor(1, 0, 0, 0.5);
			batch.draw(tex1, 75, 75, 100, 100);

			//Set the alpha back to 1.0
			batch.setColor(1)
			batch.draw(proceduralTex, 5, 5, 100, 100);

			//flush to GPU
			batch.end();
		} else {
			//The images are loading... here we might render a loading bar.
		}
	}
});