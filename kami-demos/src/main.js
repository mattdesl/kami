var $ = require('jquery');

//Get the array of demos we will be showing
var demoList = require('./index.js');

var currentDemo = null,
	parentContainer = null,
	width, height;

function setDemo(demo) {
	currentDemo = demo;

	demo.setup(parentContainer);
	demo.resize(width, height);
	demo.show();
}

function render() {
	currentDemo.render();
	requestAnimationFrame(render);
}

$(function() {
	//we'll just use body as our parent container for demos...
	parentContainer = $("body");
	parentContainer.css("overflow", "hidden");

	//handle resize for current demo
	$(window).resize(function() {
		if (currentDemo) {
			width = $(window).width();
			height = $(window).height();
			currentDemo.resize( width, height );
		}
	});

	//show the first demo in the list
	setDemo(demoList[0]);

	requestAnimationFrame(render);
});