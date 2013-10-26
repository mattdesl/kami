## Running the Demos

The bundled files are already included for you; this allows you to run the demos without needing to pull in any dependencies. Just run the "index.html" file. 

## Building the Demos

If you want to modify and build the demos, you will need the following:

- Node
- NPM version >= 1.1.65
- Bower

First, `cd` to the root `kami` directory. Then, install NPM and browser dependencies like so:

```
npm install
bower install
```

It will take a little while to grab jQuery and others. Next, we have to link the demos to the kami folder. We only do this so that we aren't using relative paths inside the `demos/src` folder, and so that our `require()` statements look clean. 


First we `cd` to the demos directory, and then link.
```
cd demos
npm link ../
```

Now we are all set up. From here, whenever we make changes to the demo sources, we need to re-bundle our app like so: (called from root directory)

```
grunt build-demos
```

This gets annoying to do all the time, so instead we can use a watch task to do it for us. You should grab the LiveReload plugin for Chrome/FF for an even better workflow.

```
grunt watch-demos
```

## Adding Demos

The demos are listed in the `main.js` entry point. If you want to add a demo, feel free to include it there and shoot us a Pull Request. 


## Working with UMD

Using dependency managers like NPM and Bower are usually good practice, but if that sort of thing isn't for you, you can grab the UMD build and use KAMI directly in your script code.

HTML:  

```html
	<script src="kami.umd.js" type="text/javascript"></script>
```

JS:
```javascript
	var myShader = new KAMI.ShaderProgram( ... );
	//.. do something here
```