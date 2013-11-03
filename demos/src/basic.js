//We use browserify to alias the kami-gl namespace,
//this way the code looks exactly the same in regular Node projects

var WebGLContext = require('kami-gl').WebGLContext;
var Texture = require('kami-gl').Texture;
var AssetManager = require('kami').AssetManager;
var SpriteBatch = require('kami').SpriteBatch;

$(function() {
	var mainContainer = $("body").css({
		background: "#343434"
	});

	var text = $("<span>some dom text...</span>").css({
		position: "absolute",
		top: 20, 
		left: 20,
		zIndex: -1
	});
	mainContainer.append(text);

	var width = 256;
	var height = 256;

	//create our webGL context..
	//this will manage viewport and context loss/restore
	var context = new WebGLContext(width, height);


	//add the view to the body
	mainContainer.append(context.view);

	
	//We use this for rendering 2D sprites
	var batch = new SpriteBatch(context);

	//We use this to ensure that images are loaded before trying to render them
	var assets = new AssetManager(context);

	//This returns a Texture object
	var tex0 = assets.load("img/grass.png");
	var tex1 = assets.load("img/scene.png");

	//In WebGL, repeat wrapping only works with power-of-two images!
	tex0.setWrap(Texture.Wrap.REPEAT);

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

			batch.draw(tex0, 
						0, 0, 		  //x, y
						width, height,//width, height
						0.25, 		  //alpha 
						0, 0, 2, 2);  //we can adjust UVs to repeat easily

			batch.draw(tex1, 75, 75, 100, 100);

			//flush to GPU
			batch.end();
		} else {
			//The images are loading... here might render a loading bar.
		}
	}
	
});