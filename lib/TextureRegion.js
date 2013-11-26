var Class = require('klasse');
var Texture = require('./Texture');

//Is this class really within the scope of Kami? if we introduce this, we may as well
//introduce an atlas into kami as well. maybe kami-atlas would be better...
var TextureRegion = new Class({

	initialize: function TextureRegion(texture, x, y, width, height) {
		x = x || 0;
		y = y || 0;
		width = (width===0 || width) ? width : texture.width;
		height = (height===0 || height) ? height : texture.height;

		//setup our instance members in constructor..
		this.texture = texture;
		this.u = 0;
		this.v = 0;
		this.u2 = 0;
		this.v2 = 0;

		this.set(texture, x / texture.width,
                          y / texture.height,
                          (x + width) / texture.width,
                          (y + height) / texture.height);
	    this.regionWidth = Math.round(width);
        this.regionHeight = Math.round(height);
	},

	setNormalized: function(texture, u, v, u2, v2) {
		this.texture = texture;
		this.u = u;
		this.v = v;
		this.u2 = u2;
		this.v2 = v2;
        this.regionWidth = Math.round(Math.abs(this.u2 - this.u) * texture.width);
        this.regionHeight = Math.round(Math.abs(this.v2 - this.v) * texture.height);
	},

	setFromRegion: function(region, x, y, width, height) {
	//TODO...		
	}
});

module.exports = TextureRegion;