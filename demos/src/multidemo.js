var demos = [
	require('./bar.js'),
	require('./foo.js'),
	require('./complex')
];


$(function() {
	var mainContainer = $("body").css({
		background: "#000"
	});

	var demoContainers = [];
	var currentDemo = null;
	var currentIndex = 0;

	function killTweens() {
		demoContainers.map(function(x) {
			x.stop(true);
		});
	}

	function showDemo(index, toRight) {
		if (currentDemo) {
			var old = currentDemo;
			var anim = !toRight ? {width:'0'} : {left:'100%'};

			//animate out the current demo if we have one
			old.animate(anim, 400, function() {
				old.detach();
			}.bind(this));
			currentDemo = null;
		}

		currentIndex = index;
		currentDemo = demoContainers[index];

		currentDemo.css({
			left: 0,
			width: "100%"
		});
		currentDemo.prependTo(mainContainer);
	}
	
	mainContainer.keydown(function(ev) {
		if (ev.keyCode == 37) {
			currentIndex--;
			if (currentIndex < 0)
				currentIndex = demoContainers.length-1;
			showDemo(currentIndex, false);
		} else if (ev.keyCode == 39) {
			currentIndex++;
			if (currentIndex > demoContainers.length-1)
				currentIndex = 0;
			showDemo(currentIndex, true);
		}
	});

	demos.map(function(DemoClass, index) {
		var demo = new DemoClass();
		var container = $("<div>").css({
			background: demo.background,
			position: "absolute",
			top: 0,
			left: 0,
			width: "100%",
			height: "100%",
			overflow: "hidden"
		});
		demoContainers.push(container);
	}.bind(this));

	if (demoContainers.length > 0) {
		showDemo(0);
	}
}); 