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
		        	'<%= dirs.build %>/kami.min.js': ['<%= dirs.build %>/kami.js']
		      	}
		    },
		    demos: {
		      	files: {
		        	'<%= dirs.demo_build %>/kami.min.js': ['<%= dirs.build %>/kami.js']
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
		},

		//We use a little grunt plugin to write out the index.js file.
		//This also builds a UMD-specific index file, which is then browserified.
		autoindex: {
			umd: {
				options: {
					banner: "/**\n" +
			 		"  Auto-generated Kami index file.\n" +
			 		"  Dependencies are placed on the top-level namespace, for convenience.\n" +
			  		"  Created on <%= grunt.template.today('yyyy-mm-dd') %>\n" +
			  		"*/",
					
					// Options for our dependency modules...
					modules: {

						//Export this module with the name 'Class'
						'klasse': {
							standalone: 'Class'
						},

						//We want to export the NumberUtils too..
						//we'll use the same naming style as the rest of Kami
						'number-util': {
							standalone: 'NumberUtil'
						}
					}
				},
				dest: '<%= dirs.src %>/index-umd.js',
				src: '<%= dirs.src %>'
			},

			core: {
				options: {
					banner: "/**\n" +
			 		"  Auto-generated Kami index file.\n" +
			  		"  Created on <%= grunt.template.today('yyyy-mm-dd') %>\n" +
			  		"*/",

			  		// only core modules 
					dependencies: [], 
					// ignore the UMD file if it's present 
					file_ignores: ['<%= dirs.src %>/index-umd.js'],
				},
				dest: '<%= dirs.src %>/index.js',
				src: '<%= dirs.src %>'
			}
		}
	});
	
	//Builds core library
	grunt.registerTask('build-umd', ['autoindex:umd', 'browserify:umd', 'uglify:umd']);

	//Depends on build-umd
	grunt.registerTask('build-demos', ['browserify:demos', 'uglify:demos'])

	
	grunt.registerTask('build', ['autoindex:core', 'build-umd', 'build-demos', 'yuidoc']);
	grunt.registerTask('default', ['build']);

};