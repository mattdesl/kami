YUI.add("yuidoc-meta", function(Y) {
   Y.YUIDoc = { meta: {
    "classes": [
        "BaseBatch",
        "FrameBuffer",
        "Mesh",
        "Mesh.Attrib",
        "ShaderProgram",
        "SpriteBatch",
        "Texture",
        "WebGLContext"
    ],
    "modules": [
        "kami-batch",
        "kami-context",
        "kami-fbo",
        "kami-mesh-buffer",
        "kami-shader",
        "kami-texture"
    ],
    "allModules": [
        {
            "displayName": "kami-batch",
            "name": "kami-batch",
            "description": "The core kami module provides basic 2D sprite batching and \nasset management."
        },
        {
            "displayName": "kami-context",
            "name": "kami-context",
            "description": "Creates a WebGL context which attempts to manage the \nstate of kami objects that are created with this as a \nparameter."
        },
        {
            "displayName": "kami-fbo",
            "name": "kami-fbo"
        },
        {
            "displayName": "kami-mesh-buffer",
            "name": "kami-mesh-buffer"
        },
        {
            "displayName": "kami-shader",
            "name": "kami-shader",
            "description": "Shader utilities for kami."
        },
        {
            "displayName": "kami-texture",
            "name": "kami-texture",
            "description": "Texture utils for kami."
        }
    ]
} };
});