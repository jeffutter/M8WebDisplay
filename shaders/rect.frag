#version 300 es
precision highp float;

in vec3 colourV;

out vec4 fragColour;

void main() {
    fragColour = vec4(colourV, 1.0);
}
