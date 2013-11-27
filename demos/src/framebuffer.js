
var WebGLContext = require('kami').WebGLContext;
var Texture = require('kami').Texture;
var AssetManager = require('kami').AssetManager;
var SpriteBatch = require('kami').SpriteBatch;
var FrameBuffer = require('kami').FrameBuffer;
var TextureRegion = require('kami').TextureRegion;

$(function() {
	var mainContainer = $("body").css({
		background: "#343434"
	});


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

	var batch = new SpriteBatch(context);

	var assets = new AssetManager(context);

	var tex0 = assets.load("img/scene.png");

	var fbo = new FrameBuffer(context, 256, 256);

	var fboRegion = new TextureRegion(fbo.texture);
	fboRegion.flip(false, true);

	requestAnimationFrame(render);

	function render() {
		requestAnimationFrame(render);

		if (assets.update()) {
			fbo.begin();
			batch.setProjection(width/2, height/2)
			batch.begin();
			batch.draw(tex0, 0, 0);
			batch.end();

			fbo.end();

			batch.begin(fbo.width/2, fbo.height/2);
			batch.drawRegion(fboRegion, 0, 0)
			batch.end();
		}
	}

	setupUI();

	function setupUI() {
		var fontCSS = {
			color: "white",
			fontSize: "10px",
			position: "absolute",
			textTransform: "uppercase",
			left: 40
		};

		fontCSS.top = height + 20;
		progressLabel = $("<div>").css(fontCSS).appendTo($("body"));
		progressLabel.hide();

		var loseCtx = context.gl.getExtension("WEBGL_lose_context");
		
		if (loseCtx) { //may be null depending on browser, or if we have GL debuggers enabled
			fontCSS.top = height + 50;

			$("<div>Click the canvas to simulate context loss / restore</div>")
				.css(fontCSS)
				.appendTo($("body"));

			canvas.mousedown(function() {
				canvas.hide();
				loseCtx.loseContext();	

				setTimeout(function() {
					canvas.show();
					loseCtx.restoreContext();
				}.bind(this), 1000);	
			}.bind(this))
		}
	}
});