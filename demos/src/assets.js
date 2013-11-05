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


	var progressLabel; // a jQuery div
	setupUI();
	

	var batch = new SpriteBatch(context);

	var assets = new AssetManager(context);

	assets.loadProgress.add(function(current, total, name) {
		var perc = ~~((current/total)*100);
		progressLabel.text("Progress: "+perc+"%");
		console.log("Loaded", name, ": "+ perc + "%");
	});
	assets.loadFinished.add(function() {
		console.log("Done loading.");
		progressLabel.hide();
	});
	assets.loadStarted.add(function() {
		console.log("Started loading.")
		progressLabel.show();
		progressLabel.text("Progress: 0%");
	});

	context.lost.add(function() {
		//e.g. user is on home screen of their device
		console.log("Context lost");
	});

	context.restored.add(function() {
		//e.g. user has come back to our WebGL page
		console.log("Context restored");
	});

	//This creates a new Texture object that won't be renderable until
	//the asset has finished loading.
	var tex0 = assets.load("img/scene.png");

	//incase we want more control over the creation of the texture, we can do this
	//now the asset loader will push the data into the specified tex1
	var tex1 = new Texture(context);
	assets.load("img/grass.png", tex1);

	//Here we'll simulate a longer loading time
	var tex3 = new Texture(context);
	var count = 25;
	for (var i=0; i<count; i++) {
		var name = "grass"+i;

		//This is a more verbose way of doing things. with loadAs you can specify
		//the exact loader instead of having it guess based on filename.
		//This also means we can use a generic key like "grass0" for the asset.
		//The last parameter is the path of the actual image.
		assets.loadAs(name, AssetManager.ImageLoader, tex3, "img/grass.png");
	}

	requestAnimationFrame(render);

	function render() {
		requestAnimationFrame(render);

		
		if (assets.update()) { //assets have been loaded.
			canvas.css("background", "#86B32A");

			batch.setProjection(width/2, height/2);
			batch.begin();
			batch.draw(tex0, 50, 50, 50, 50);

			batch.draw(tex1, 75, 75, 100, 100);
			batch.end();
		} else {			
			canvas.css("background", "black");
		}
	}
	

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