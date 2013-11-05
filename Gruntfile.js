module.exports = function(grunt) {
	
	require('load-grunt-tasks')(grunt);
	var fs = require('fs');
	var walk = require('fs-walk');
	var path = require('path');

	grunt.initConfig({

		pkg: grunt.file.readJSON('package.json'),

		dirs: {
			build: 'build',
			src: 'lib',
			demos: 'demos', 
			demo_src: 'demos/src',
			demo_build: 'demos/build',
			docs: 'docs'
		},

		browserify: {
			//We include a UMD build for non-Node people...
			umd: {
				src: ['<%= dirs.src %>/index-umd.js'],
				dest: '<%= dirs.build %>/kami.umd.js',
				
				options: {
					standalone: "kami",
					// debug: true
				}
			},
			
			demos: {
				src: ['<%= dirs.src %>/index.js'],
				dest: '<%= dirs.demo_build %>/bundle.js',
				
				options: {
					debug: true,
					alias: [
						'<%= dirs.src %>/index.js:kami',
						'signals', //externalize
						'gl-matrix'
					]
				}
			}
		},

		watch: {
			demos: { 
				//Watch for changes...
				files: ['<%= dirs.src %>/**/*.js', 
						'<%= dirs.demo_src %>/**/*.js',
						'<%= dirs.demos %>/**/*.html', 
						'Gruntfile.js'],
				tasks: ['browserify:demos', 'yuidoc'],
				options: { 
					livereload: true
				},
			},
		},


		uglify: {
			umd: {
		      	files: {
		        	'<%= dirs.build %>/kami.umd.min.js': ['<%= dirs.build %>/kami.umd.js']
		      	}
		    },
		    demos: {
		      	files: {
		        	'<%= dirs.demo_build %>/kami.umd.min.js': ['<%= dirs.build %>/kami.umd.js']
		      	}
		    }
		},

		//Builds the documentation; do not run this task directly
		yuidoc: {
			compile: {
				name: '<%= pkg.name %>',
				description: '<%= pkg.description %>',
				version: '<%= pkg.version %>',
				url: '<%= pkg.homepage %>',
				options: {
					paths: '<%= dirs.src %>',
					outdir: '<%= dirs.docs %>',

					//nocode: true, 
				}
			}
		}
	});

	var UMD_IGNORES = [
		'index-umd.js'
	];
	
	grunt.registerTask('umd-index', 'Writes the UMD index.js', function() {
		grunt.log.writeln("Writing index-umd.js");

		var banner = [
				"/**",
				"    This is the auto-generated index for UMD builds.",
				"    Generated on: <%= grunt.template.today('yyyy-mm-dd') %>",
				"*/\n"].join('\n');
		
		var text = banner;

		text = grunt.template.process(text);

		text += "module.exports = {\n";

		var UMD_DEPS = Object.keys( grunt.file.readJSON('package.json').dependencies );

		var mainDir = grunt.template.process('<%= dirs.src %>');

		var reqs = [{comment: 'core classes'}];
		walk.walkSync(mainDir, function(basedir, filename, stat) {
			if (stat.isDirectory())
				return;
			if (filename.toLowerCase() === "index.js"
				|| UMD_IGNORES.indexOf(filename.toLowerCase()) !== -1)
				return;

			if (path.extname(filename) in require.extensions) {
				var fullname = path.join(basedir, filename);
				var reqName = fullname.split(path.sep);
				reqName.shift(); //remove src folder

				//re-join paths.. maybe better way of doing this in node
				var reqPath = './' + path.join.apply(this, reqName);
				var className = path.basename(reqPath, path.extname(reqPath));
				reqs.push({name: className, path: reqPath});
			}
		});

		for (var i=0; i<UMD_DEPS.length; i++) {
			reqs.push({comment:UMD_DEPS[i]+' dependencies'});

			var dep = require(UMD_DEPS[i]);
			for (var k in dep) {
				if (dep.hasOwnProperty(k)) {
					reqs.push({path: UMD_DEPS[i], name: k, prop: k });
				}
			}
		}

		var longest = 0;
		for (var i=0; i<reqs.length; i++) {
			if (reqs[i].comment) continue;
			longest = Math.max(longest, reqs[i].name.length);
		}

		for (var i=0; i<reqs.length; i++) {
			if (reqs[i].comment) {
				if (i!==0)
					text += '\n';
				text += '    //'+reqs[i].comment+'\n';
				continue;
			}
			var className = reqs[i].name;
			var reqPath = reqs[i].path;
			var tab = Array( Math.max(4, 4 + longest-className.length) ).join(' ');

			text += "    '" + className + "':"+tab+"require('"+reqPath+"')";
			if (reqs[i].prop)
				text += '.'+reqs[i].prop;

			if (i !== reqs.length-1)
				text += ',\n';
			else
				text += '\n';
		}
		text += "};";

		var file = grunt.template.process('<%= dirs.src %>/index-umd.js');
		fs.writeFileSync(file, text)
	});

	//Builds core library
	grunt.registerTask('build-umd', ['umd-index', 'browserify:umd', 'uglify:umd']);

	//Depends on build-umd
	grunt.registerTask('build-demos', ['browserify:demos', 'uglify:demos'])

	//
	grunt.registerTask('build', ['build-umd', 'build-demos']);
	grunt.registerTask('default', ['build']);

};