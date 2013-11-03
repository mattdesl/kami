## kami

Kami is a fast and lightweight WebGL sprite rendering framework. It can be used for 2D or 3D purposes, and aims to support modern WebGL features like compressed textures.

## Features

- **WebGLContext**


- **WebGLContext** 
	- manages textures, shaders, and other GL objects that need to be recreated on context loss
- **Texture** - a wrapper around OpenGL textures
	- Handles data provided by Image or another means, such as ArrayBufferView or a HTMLVideoElement
	- Can easily support other texture targets, such as cube or array textures
	- Automatically managed by WebGLContext in context loss
- **ShaderProgram** - a utility for compiling and managing shaders
	- Caches uniform and attribute locations
- **VertexData** - a utility to manage a mesh made up of an interleaved Vertex Buffer Object and an Index Buffer Object. This is tied in with ShaderProgram to make attribute definitions easy to work with.

## TODO

- **FrameBuffer** - a FBO utility which allows for a depth component 
- **AbstractBatch** - a base class for custom billboard (quad) batchers to build off of
- **SimpleBatch** - a fast and efficient sprite batcher that uses a single large buffer
- **MultitextureBatch** - an even faster sprite batcher that renders up to 4 textures in a single draw call

## Advanced WebGL 2 Features (TODO)

- **InstancedVertexData** - support instanced drawing
- **TextureArrayBatch** - support GL2 texture arrays for bindless batching
- **SimpleBatch3D** - a batch that sends a Z position to the shader and optionally sorts all objects by texture + z-index (to take advantage of Z buffer)
- **Texture.S3TCProvider** - a provider for compressed textures
- **Texture.CubeMapProvider** - a provider for cube maps
- ensure floating point textures works 
- support MRTs with FrameBuffer
- VAO, TransformFeedback, etc utilities ?