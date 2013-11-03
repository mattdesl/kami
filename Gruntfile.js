module.exports = function(grunt) {
	
	require('load-grunt-tasks')(grunt);

	var docDependencies = [ //Find a better way to handle this...
		//Other dependencies we want to include in main doc
		//These are temporary files copied from node_modules
		//so that YUIDoc gets the right path names
		'kami-gl'
	];

	var docPaths = ['<%= dirs.src %>'].concat(docDependencies);

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
			UMD: {
				src: ['<%= dirs.src %>/index-umd.js'],
				dest: '<%= dirs.build %>/kami.umd.js',
				
				options: {
					standalone: "kami"
				}
			},
			
			demos: {
				src: ['<%= dirs.src %>/index.js'],
				dest: '<%= dirs.demo_build %>/bundle.js',
				
				options: {
					debug: true,
					alias: [
						'<%= dirs.src %>/index.js:kami',
						'kami-gl',
						'signals'
					]
				}
			}
		},

		watch: {
			demos: { 
				//Watch for changes...
				files: ['<%= dirs.src %>/**/*.js', 
						'node_modules/kami-gl/lib/**/*.js',
						'<%= dirs.demo_src %>/**/*.js',
						'<%= dirs.demos %>/**/*.html', 
						'Gruntfile.js'],
				tasks: ['browserify:demos', 'doc'],
				options: { 
					livereload: true
				},
			},
		},

		copy: {
			//For source discovery to work properly in YUIDoc,
			//we need to copy the files, THEN doc, then delete the 
			//copied files.
			docDependencies: {
				files: [
				    {
				    	expand: true, src: ['lib/**'], 
				    	cwd: 'node_modules/kami-gl', dest: 'kami-gl/'
				    }
		      	]
			}
		},

		clean: {  
			docDependencies: docDependencies
		},

		//Builds the documentation; do not run this task directly
		yuidoc: {
			compile: {
				name: '<%= pkg.name %>',
				description: '<%= pkg.description %>',
				version: '<%= pkg.version %>',
				url: '<%= pkg.homepage %>',
				options: {
					paths: docPaths,
					outdir: '<%= dirs.docs %>',

					//nocode: true, 
				}
			}
		}
	});

	grunt.registerTask('doc', ['copy:docDependencies', 'yuidoc', 'clean:docDependencies']);
	grunt.registerTask('default', ['build-all']);

};