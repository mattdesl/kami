
var glob = require('glob');

module.exports = function(grunt) {
	
	require('load-grunt-tasks')(grunt);

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
				dest: '<%= dirs.build %>/kami.js',
				
				options: {
					standalone: "kami",
					debug: true
				}
			},
		},

		uglify: {
			umd: {
		      	files: {
		        	'<%= dirs.build %>/kami.min.js': ['<%= dirs.build %>/kami.js']
		      	}
		    },
		},

		//Builds the documentation; do not run this task directly
		yuidoc: {
			compile: {
				name: '<%= pkg.name %>',
				description: '<%= pkg.description %>',
				version: '<%= pkg.version %>',
				url: '<%= pkg.homepage %>',
				options: {
					paths: glob.sync('node_modules/kami-*'),
					outdir: '<%= dirs.docs %>',

					nocode: true, 
				}
			}
		},
	});
	
	//Builds core library
	grunt.registerTask('build-umd', ['browserify:umd', 'uglify:umd']);
	
	grunt.registerTask('build', ['build-umd', 'yuidoc']);
	grunt.registerTask('default', ['build']);

};