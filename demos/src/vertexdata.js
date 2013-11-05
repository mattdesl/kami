//This is a "low level" example, i.e. using Kami
//without its high-level AssetManager, SpriteBatch, etc.
//
//This could be useful if you are writing your own engine
//and want to handle sprite rendering and asset management differently.

var WebGLContext = require('kami').WebGLContext;
var ShaderProgram = require('kami').ShaderProgram;
var Texture = require('kami').Texture;
var Mesh = require('kami').Mesh;

$(function() {
	var mainContainer = $("body").css({
		background: "#343434"
	});

	var demoContainers = [];
	var currentDemo = null;
	var currentIndex = 0;

	var width = 256;
	var height = 256;

	var canvas = $("<canvas>").css({
		position: "fixed",
		top: 0,
		left: 0,
		overflow: "hidden"
	});

	canvas.appendTo(mainContainer);

	//create our webGL context..
	//this will manage viewport and context loss/restore
	var context = new WebGLContext(width, height, canvas[0]);

	//create a basic shader..
	//this will be added to the context and re-compiled on context restore
	var shader = new ShaderProgram(context, $("#vert_shader").html(), $("#frag_shader").html());

	//Sometimes the shader compilation will give us useful debugging information...
	if (shader.log)
		console.warn(shader.log);

	//setup uniform locations
	shader.bind();
	shader.setUniformi("tex0", 0);
	shader.setUniformf("alpha", 0.25);

	//create texture from Image (async load)
	var tex = new Texture(context);
	
	//Note that this only works in WebGL with power-of-two texture sizes.
	tex.setWrap(Texture.Wrap.REPEAT);

	//make up some vertex data, interleaved with {x, y, u, v}
	var vertices = new Float32Array([
		-1, -1, //xy
		0, 0,   //uv

		1, -1,
		1, 0,

		1, 1,
		1, 1,

		-1, 1, 
		0, 1 
	]);
		
	//our inidices, two triangles to form a quad
	var indices = new Uint16Array([
		0, 1, 2,
		0, 2, 3,
	]);

	// here we create a VBO and IBO with:
	// 		static=true, numVerts=4, numIndices=6
	var vbo = new Mesh(context, true, 4, 6, [
		//a list of vertex attribuets to match the shader
		new Mesh.Attrib("Position", 2, 0),
		new Mesh.Attrib("TexCoord", 2, 1)
	]);

	//here we override the vertices
	vbo.indices = indices;
	vbo.vertices = vertices;

	//set the mesh to "dirty" so that it gets uploaded 
	//this write-only property sets verticesDirty and indicesDirty to true
	vbo.dirty = true;



	var time = 0, ready = false;	

	//start the asset loading
	loadAssets();
		
	//start the render loop
	requestAnimationFrame(render);

	function loadAssets() {
		//This is why using an AssetManager makes things much easier...
		
		//async load the image
		var img = new Image();
		img.onload = function() {
			tex.uploadImage(img);
			ready = true;
		}
		img.src = "img/grass.png";
	}

	//listen for context loss events, and stop rendering
	//until image is re-loaded...
	context.lost.add(function() {
		ready = false;
	});

	context.restored.add(function() {
		//once context is ready again, we can load
		//the assets 
		loadAssets();
	});

	function render() {
		requestAnimationFrame(render);

		if (!ready) 
			return;

		var gl = context.gl;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		
		
		tex.bind();
		shader.bind();

		//Keep in mind that we don't necessarily
		//need to call this every frame. However,
		//on context loss these values are reset. So
		//this is an easy way to avoid dealing with that.
		shader.setUniformi("tex0", 0);		
		
		var val = Math.sin(time+=0.05) / 2 + 0.5;
		shader.setUniformf("colorMod", 1.0, val, 1.0, 1.0);
		shader.setUniformf("time", time);

		vbo.bind(shader);
		vbo.draw(gl.TRIANGLES, 6, 0);
		vbo.unbind(shader);
	}
	
	var loseCtx = context.gl.getExtension("WEBGL_lose_context");

	if (loseCtx) { //may be null depending on browser, or if we have GL debuggers enabled
		$("<div>Click the canvas to simulate context loss / restore</div>").css({
			color: "white",
			fontSize: "10px",
			position: "absolute",
			textTransform: "uppercase",
			top: height + 40,
			left: 40
		}).appendTo($("body"));

		canvas.mousedown(function() {
			canvas.hide();
			loseCtx.loseContext();	

			setTimeout(function() {
				canvas.show();
				loseCtx.restoreContext();
			}.bind(this), 1000);	
		}.bind(this))
	}
});