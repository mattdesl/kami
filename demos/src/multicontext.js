//We use browserify to alias the kami namespace,
//this way the code looks exactly the same in regular Node projects
 

var WebGLContext = require('kami').WebGLContext;
var Texture = require('kami').Texture;
var AssetManager = require('kami').AssetManager;
var SpriteBatch = require('kami').SpriteBatch;



var Renderer = function(x, y, width, height, bg) {
	//create our webGL context..
	//this will manage viewport and context loss/restore
	this.context = new WebGLContext(width, height);

	//the jQuery-wrapped Canvas element
	this.view = $(this.context.view);
	this.view.css({
		background: bg || 'black',
		position: "absolute",
		top: y,
		left: x
	});

	//We use this to ensure that images are loaded before trying to render them
	this.assets = new AssetManager(this.context);

	//Unfortunately WebGL does not allow us to share textures
	//between contexts (yet). So we need to load them separately.
	//
	//The default ImageLoader does not allow us to share Image objects;
	//but this isn't such a big deal since they are cached anyways.
	this.tex0 = this.assets.load("img/grass.png");

	//We use this for rendering 2D sprites
	this.batch = new SpriteBatch(this.context);

	this.red = 1;
	this.green = 1;
	this.blue = 1;

	//How we will render this context...
	this.update = function() {
		if (this.assets.update()) { //finished loading assets

			var cx = width/2, 
				cy = height/2,
				sz = 40;

			this.batch.setProjection(cx, cy);
			this.batch.begin();
			this.batch.setColor(this.red, this.green, this.blue);
			this.batch.draw(this.tex0, cx - sz/2, cy -sz/2, sz, sz);
			this.batch.end();
		} else {
			//still loading animations...
		}
	}.bind(this);
}


$(function() {
	var mainContainer = $("body").css({
		background: "#343434"
	});

	//add the view to the body
	var renderer1 = new Renderer(5, 5, 100, 100, "white"),
		renderer2 = new Renderer(115, 5, 150, 150, "white");

	mainContainer.append(renderer1.view);
	mainContainer.append(renderer2.view);

	var t = 0;
  	
	function render() {
		requestAnimationFrame(render);

		t += 0.05;
		renderer1.red = Math.sin(t) / 2 + 0.5;
		renderer1.green = Math.sin(t*0.5) / 2 + 0.5;

		renderer2.blue = Math.sin(t) / 2 + 0.5;
		renderer2.green = renderer1.red;

		renderer1.update();
		renderer2.update();
	}

  	requestAnimationFrame(render);


	setupUI();
	

	function handleMouse(view, context) {
		var loseCtx = context.gl.getExtension("WEBGL_lose_context");
		if (loseCtx) {
			view.mousedown(function() {
				view.hide();
				loseCtx.loseContext();	

				setTimeout(function() {
					view.show();
					loseCtx.restoreContext();
				}.bind(this), 1000);	
			}.bind(this))
		}
	}

	function setupUI() {
		var fontCSS = {
			color: "white",
			fontSize: "10px",
			position: "absolute",
			textTransform: "uppercase",
			left: 40,
			top: 250
		};

		$("<div>Click either canvas to simulate context loss / restore</div>")
			.css(fontCSS)
			.appendTo($("body"));

		
		handleMouse(renderer1.view, renderer1.context);
		handleMouse(renderer2.view, renderer2.context);
	}
});